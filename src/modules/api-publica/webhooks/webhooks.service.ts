import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { lookup } from 'dns/promises';
import { cifrar, descifrar } from '../../../shared/crypto/cifrado';
import { EVENTOS, NOMBRES_EVENTOS, type EventoComprobante, type EventoImportacion } from '../../../shared/eventos/eventos';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ComprobantesService } from '../../comprobantes';
import { ImportacionesService, ItemsFacturablesService } from '../../importaciones';
import { comprobantePublico, importacionPublica, type ComprobanteInterno } from '../representaciones';
import { EVENTO_PRUEBA, firmar, generarSecreto, MAX_INTENTOS, proximoIntento } from './firma';
import { esIpPrivada, mensajeErrorConexion, validarUrlWebhook } from './url-webhook';

const LOTE = 25;
const TIMEOUT_MS = 10_000;
/** Mientras se entrega, la fila queda "tomada" este tiempo (evita dos envíos simultáneos). */
const RESERVA_MS = 2 * 60_000;

const SELECT_SUSCRIPCION = { id: true, url: true, eventos: true, activa: true, integracionId: true, createdAt: true } as const;

function eventoId(partes: string[]): string {
  return `evt_${createHash('sha256').update(partes.join(':')).digest('hex').slice(0, 24)}`;
}

export interface ResultadoEnvio {
  ok: boolean;
  status: number | null;
  error: string | null;
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  private readonly produccion: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly comprobantes: ComprobantesService,
    private readonly importaciones: ImportacionesService,
    private readonly items: ItemsFacturablesService,
    config: ConfigService,
  ) {
    this.produccion = config.get<string>('NODE_ENV') === 'production';
  }

  // ── Suscripciones ────────────────────────────────────────────────────────

  listar(tenantId: string) {
    return this.prisma.webhookSuscripcion.findMany({ where: { tenantId }, select: SELECT_SUSCRIPCION, orderBy: { createdAt: 'desc' } });
  }

  /** Crea la suscripción y devuelve el secreto de firma UNA sola vez. */
  async crear(tenantId: string, datos: { url: string; eventos: string[]; integracionId?: string }) {
    const url = this.url(datos.url);
    if (datos.integracionId) {
      const existe = await this.prisma.integracion.count({ where: { tenantId, id: datos.integracionId } });
      if (!existe) throw new NotFoundException('Integración no encontrada.');
    }
    const secreto = generarSecreto();
    const suscripcion = await this.prisma.webhookSuscripcion.create({
      data: { tenantId, url, eventos: this.eventos(datos.eventos), integracionId: datos.integracionId ?? null, secretoCifrado: cifrar(secreto) },
      select: SELECT_SUSCRIPCION,
    });
    return { suscripcion, secreto };
  }

  async actualizar(tenantId: string, id: string, datos: { url?: string; eventos?: string[]; activa?: boolean }) {
    await this.suscripcion(tenantId, id);
    return this.prisma.webhookSuscripcion.update({
      where: { tenantId_id: { tenantId, id } },
      data: {
        ...(datos.url !== undefined ? { url: this.url(datos.url) } : {}),
        ...(datos.eventos !== undefined ? { eventos: this.eventos(datos.eventos) } : {}),
        ...(datos.activa !== undefined ? { activa: datos.activa } : {}),
      },
      select: SELECT_SUSCRIPCION,
    });
  }

  async eliminar(tenantId: string, id: string) {
    await this.suscripcion(tenantId, id);
    await this.prisma.webhookSuscripcion.delete({ where: { tenantId_id: { tenantId, id } } });
  }

  async rotarSecreto(tenantId: string, id: string) {
    await this.suscripcion(tenantId, id);
    const secreto = generarSecreto();
    await this.prisma.webhookSuscripcion.update({ where: { tenantId_id: { tenantId, id } }, data: { secretoCifrado: cifrar(secreto) } });
    return { secreto };
  }

  entregas(tenantId: string, suscripcionId: string) {
    return this.prisma.webhookEntrega.findMany({
      where: { tenantId, suscripcionId },
      select: {
        id: true,
        eventoId: true,
        evento: true,
        estado: true,
        intentos: true,
        proximoIntento: true,
        ultimoStatus: true,
        ultimoError: true,
        createdAt: true,
        entregadaEn: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  /** Vuelve a poner en cola una entrega (por ejemplo, una FALLIDA después de arreglar el receptor). */
  async reenviar(tenantId: string, entregaId: string) {
    const { count } = await this.prisma.webhookEntrega.updateMany({
      where: { tenantId, id: entregaId },
      data: { estado: 'PENDIENTE', intentos: 0, proximoIntento: new Date(), ultimoError: null },
    });
    if (!count) throw new NotFoundException('Entrega no encontrada.');
    return this.entregarUna(entregaId);
  }

  /** Manda ya un evento de prueba y devuelve lo que respondió el receptor. */
  async probar(tenantId: string, id: string) {
    const s = await this.suscripcion(tenantId, id);
    const entrega = await this.prisma.webhookEntrega.create({
      data: {
        tenantId,
        suscripcionId: s.id,
        evento: EVENTO_PRUEBA,
        eventoId: eventoId([tenantId, EVENTO_PRUEBA, s.id, String(Date.now())]),
        payload: { mensaje: 'Evento de prueba del Facturador.' },
      },
    });
    return this.entregarUna(entrega.id);
  }

  // ── Encolado de eventos ──────────────────────────────────────────────────

  @OnEvent(EVENTOS.COMPROBANTE_EMITIDO, { async: true, promisify: true })
  async alEmitir(e: EventoComprobante) {
    await this.encolarComprobante(EVENTOS.COMPROBANTE_EMITIDO, e, [e.tenantId, EVENTOS.COMPROBANTE_EMITIDO, e.comprobanteId]);
  }

  @OnEvent(EVENTOS.COMPROBANTE_RECHAZADO, { async: true, promisify: true })
  async alRechazar(e: EventoComprobante) {
    await this.encolarComprobante(EVENTOS.COMPROBANTE_RECHAZADO, e, [e.tenantId, EVENTOS.COMPROBANTE_RECHAZADO, e.comprobanteId, String(e.intento ?? 0)]);
  }

  @OnEvent(EVENTOS.IMPORTACION_CONFIRMADA, { async: true, promisify: true })
  async alConfirmar(e: EventoImportacion) {
    try {
      if (!(await this.hayInteresados(e.tenantId, EVENTOS.IMPORTACION_CONFIRMADA))) return;
      const imp = await this.importaciones.obtener(e.tenantId, e.importacionId);
      await this.encolar(e.tenantId, EVENTOS.IMPORTACION_CONFIRMADA, eventoId([e.tenantId, EVENTOS.IMPORTACION_CONFIRMADA, e.importacionId]), {
        importacion: importacionPublica(imp),
      });
    } catch (err) {
      this.logger.error(`No se pudo encolar importacion.confirmada ${e.importacionId}: ${(err as Error).message}`);
    }
  }

  private async encolarComprobante(evento: string, e: EventoComprobante, partesId: string[]) {
    try {
      if (!(await this.hayInteresados(e.tenantId, evento))) return;
      const [c, items] = await Promise.all([
        this.comprobantes.obtener(e.tenantId, e.comprobanteId),
        this.items.referenciasDeComprobante(e.tenantId, e.comprobanteId),
      ]);
      await this.encolar(e.tenantId, evento, eventoId(partesId), {
        comprobante: comprobantePublico(c as unknown as ComprobanteInterno),
        items: items.map((i) => ({ id: i.id, origen: i.origen, referenciaExterna: i.referenciaExterna })),
      });
    } catch (err) {
      // Un webhook que no se pudo encolar nunca rompe la emisión.
      this.logger.error(`No se pudo encolar ${evento} ${e.comprobanteId}: ${(err as Error).message}`);
    }
  }

  private async hayInteresados(tenantId: string, evento: string) {
    return (await this.prisma.webhookSuscripcion.count({ where: { tenantId, activa: true, eventos: { has: evento } } })) > 0;
  }

  async encolar(tenantId: string, evento: string, id: string, datos: Record<string, unknown>) {
    const suscripciones = await this.prisma.webhookSuscripcion.findMany({
      where: { tenantId, activa: true, eventos: { has: evento } },
      select: { id: true },
    });
    if (!suscripciones.length) return 0;
    const { count } = await this.prisma.webhookEntrega.createMany({
      data: suscripciones.map((s) => ({
        tenantId,
        suscripcionId: s.id,
        evento,
        eventoId: id,
        payload: datos as Prisma.InputJsonValue,
      })),
      skipDuplicates: true, // mismo evento dos veces (reintento del emisor) = una sola entrega
    });
    return count;
  }

  // ── Entrega ──────────────────────────────────────────────────────────────

  @Cron(CronExpression.EVERY_30_SECONDS)
  async procesarPendientes() {
    const pendientes = await this.prisma.webhookEntrega.findMany({
      where: { estado: 'PENDIENTE', proximoIntento: { lte: new Date() } },
      select: { id: true },
      orderBy: { proximoIntento: 'asc' },
      take: LOTE,
    });
    for (const p of pendientes) {
      await this.entregarUna(p.id).catch((err) => this.logger.error(`Webhook ${p.id}: ${(err as Error).message}`));
    }
  }

  async entregarUna(entregaId: string): Promise<ResultadoEnvio> {
    const e = await this.prisma.webhookEntrega.findUnique({
      where: { id: entregaId },
      include: { suscripcion: { select: { url: true, secretoCifrado: true, activa: true } } },
    });
    if (!e || e.estado !== 'PENDIENTE') return { ok: e?.estado === 'ENTREGADA', status: e?.ultimoStatus ?? null, error: e?.ultimoError ?? null };

    // Reserva: si otro proceso ya la tomó, no se envía dos veces.
    const { count } = await this.prisma.webhookEntrega.updateMany({
      where: { id: e.id, estado: 'PENDIENTE', proximoIntento: e.proximoIntento },
      data: { proximoIntento: new Date(Date.now() + RESERVA_MS) },
    });
    if (!count) return { ok: false, status: null, error: 'La entrega ya está en curso.' };

    const cuerpo = JSON.stringify({ id: e.eventoId, evento: e.evento, creadoEn: e.createdAt.toISOString(), datos: e.payload });
    const r = e.suscripcion.activa ? await this.enviar(e.suscripcion.url, descifrar(e.suscripcion.secretoCifrado), e, cuerpo) : { ok: false, status: null, error: 'La suscripción está desactivada.' };

    const intentos = e.intentos + 1;
    const siguiente = r.ok ? null : proximoIntento(intentos);
    await this.prisma.webhookEntrega.update({
      where: { id: e.id },
      data: r.ok
        ? { estado: 'ENTREGADA', intentos, ultimoStatus: r.status, ultimoError: null, entregadaEn: new Date() }
        : {
            estado: siguiente && intentos < MAX_INTENTOS ? 'PENDIENTE' : 'FALLIDA',
            intentos,
            ultimoStatus: r.status,
            ultimoError: r.error?.slice(0, 500) ?? null,
            ...(siguiente ? { proximoIntento: siguiente } : {}),
          },
    });
    return r;
  }

  private async enviar(url: string, secreto: string, e: { evento: string; eventoId: string }, cuerpo: string): Promise<ResultadoEnvio> {
    try {
      if (this.produccion) {
        // La URL se validó al guardarla, pero el DNS puede cambiar: se vuelve a chequear al enviar.
        const direcciones = await lookup(new URL(url).hostname, { all: true });
        if (direcciones.some((d) => esIpPrivada(d.address))) return { ok: false, status: null, error: 'La URL resuelve a una dirección interna.' };
      }
      const res = await fetch(url, {
        method: 'POST',
        redirect: 'manual', // no seguir redirecciones (podrían llevar a la red interna)
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Facturador-Webhooks/1.0',
          'X-Facturador-Evento': e.evento,
          'X-Facturador-Evento-Id': e.eventoId,
          'X-Facturador-Firma': firmar(secreto, cuerpo),
        },
        body: cuerpo,
      });
      await res.body?.cancel().catch(() => undefined);
      return res.ok ? { ok: true, status: res.status, error: null } : { ok: false, status: res.status, error: `El receptor respondió ${res.status}.` };
    } catch (err) {
      const msg = (err as Error).name === 'TimeoutError' ? `Sin respuesta en ${TIMEOUT_MS / 1000} s.` : mensajeErrorConexion(err);
      return { ok: false, status: null, error: msg };
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private url(cruda: string) {
    try {
      return validarUrlWebhook(cruda, this.produccion);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
  }

  private eventos(eventos: string[]) {
    const invalidos = eventos.filter((e) => !(NOMBRES_EVENTOS as string[]).includes(e));
    if (invalidos.length || !eventos.length) {
      throw new BadRequestException(`Eventos válidos: ${NOMBRES_EVENTOS.join(', ')}.`);
    }
    return [...new Set(eventos)];
  }

  private async suscripcion(tenantId: string, id: string) {
    const s = await this.prisma.webhookSuscripcion.findUnique({ where: { tenantId_id: { tenantId, id } } });
    if (!s) throw new NotFoundException('Webhook no encontrado.');
    return s;
  }
}
