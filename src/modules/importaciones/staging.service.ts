import { Injectable } from '@nestjs/common';
import { Prisma, type EstadoItem, type ItemFacturable, type OrigenItem, type TipoDocumento } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { ClientesService } from '../clientes';
import { descripcionDeTarifa, TarifasService, type TarifaVigente } from '../tenants';
import type { Advertencia, ContextoFuente, ItemFacturableInput, PedidoTarifa, ResultadoExtraccion } from './domain/item-facturable';
import { decimalCanonico, hashContenido, validarItem, type ErrorItem } from './domain/validacion';

/** Metadatos que agrega el staging (además de los del adaptador). */
export interface MetadatosStaging {
  tarifa?: PedidoTarifa;
  /** El precio sale de la tarifa (el ítem no lo traía): se recalcula si cambia el cliente. */
  precioDeTarifa?: boolean;
  tarifaId?: string | null;
  /** Descripción original del adaptador, antes de aplicar la de la tarifa. */
  descripcionOriginal?: string;
  /** Valores que no se pudieron guardar como número o fecha (para mostrarlos en el staging). */
  valoresOriginales?: Record<string, string>;
  [clave: string]: unknown;
}

interface ItemPreparado {
  data: Omit<Prisma.ItemFacturableUncheckedCreateInput, 'tenantId' | 'importacionId'>;
  estado: EstadoItem;
  /** Cliente resuelto por documento con una referencia externa todavía sin vincular. */
  vincular?: { referencia: string; clienteId: string };
}

function hoy(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
}

function fecha(v: string | undefined | null): Date | null {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : d;
}

function ymd(d: Date | null): string | undefined {
  return d ? d.toISOString().slice(0, 10) : undefined;
}

const TIPOS_DOC: TipoDocumento[] = ['CUIT', 'CUIL', 'DNI', 'PASAPORTE', 'CONSUMIDOR_FINAL'];

/** Reconstruye el ItemFacturableInput de un ítem guardado (para revalidarlo tras una edición). */
export function inputDeItem(i: ItemFacturable): ItemFacturableInput {
  const m = (i.metadatos ?? {}) as MetadatosStaging;
  const originales = m.valoresOriginales ?? {};
  return {
    origen: i.origen,
    referenciaExterna: i.referenciaExterna,
    cliente: {
      ...(i.clienteId ? { clienteId: i.clienteId } : {}),
      ...(i.clienteNumeroDocumento ? { numeroDocumento: i.clienteNumeroDocumento, tipoDocumento: i.clienteTipoDocumento ?? undefined } : {}),
      ...(i.clienteReferenciaExterna ? { referenciaExterna: i.clienteReferenciaExterna } : {}),
      ...(i.clienteAlta ? { alta: i.clienteAlta as unknown as ItemFacturableInput['cliente']['alta'] } : {}),
    },
    descripcion: m.precioDeTarifa && m.descripcionOriginal ? m.descripcionOriginal : i.descripcion,
    cantidad: originales.cantidad ?? i.cantidad.toString(),
    unidad: (originales.unidad ?? i.unidad) as ItemFacturableInput['unidad'],
    ...(m.precioDeTarifa ? {} : { precioUnitario: originales.precioUnitario ?? i.precioUnitario.toString() }),
    ...(m.precioDeTarifa ? {} : { moneda: i.moneda, alicuotaIva: i.alicuotaIva.toString() }),
    ...((originales.fecha ?? i.fecha) ? { fecha: originales.fecha ?? ymd(i.fecha) } : {}),
    ...(i.periodoDesde || i.periodoHasta || originales.periodoDesde
      ? { periodo: { desde: originales.periodoDesde ?? (ymd(i.periodoDesde) as string), hasta: originales.periodoHasta ?? (ymd(i.periodoHasta) as string) } }
      : {}),
    metadatos: m,
  };
}

@Injectable()
export class StagingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clientes: ClientesService,
    private readonly tarifas: TarifasService,
  ) {}

  /**
   * Resuelve cliente y tarifa, valida y arma los datos a guardar. No escribe (salvo nada):
   * lo usan el ingreso de un lote y la revalidación de un ítem editado.
   */
  async preparar(tenantId: string, origen: OrigenItem, inputs: ItemFacturableInput[]): Promise<ItemPreparado[]> {
    const ids = inputs.map((i) => i.cliente?.clienteId).filter((x): x is string => Boolean(x));
    const refs = inputs.map((i) => i.cliente?.referenciaExterna).filter((x): x is string => Boolean(x));
    const docs = inputs
      .filter((i) => i.cliente?.numeroDocumento && TIPOS_DOC.includes((i.cliente.tipoDocumento ?? 'CUIT') as TipoDocumento))
      .map((i) => ({ tipo: (i.cliente.tipoDocumento ?? 'CUIT') as TipoDocumento, numero: i.cliente.numeroDocumento as string }));
    const [existentes, porRef, porDoc] = await Promise.all([
      this.clientes.existentes(tenantId, ids, true),
      this.clientes.porReferencias(tenantId, origen, refs),
      this.clientes.porDocumentos(tenantId, docs),
    ]);

    const resueltos = inputs.map((i) => {
      const c = i.cliente ?? {};
      if (c.clienteId) return existentes.has(c.clienteId) ? c.clienteId : null;
      if (c.referenciaExterna && porRef.has(c.referenciaExterna)) return porRef.get(c.referenciaExterna) as string;
      if (c.numeroDocumento) return porDoc.get(`${c.tipoDocumento ?? 'CUIT'}:${c.numeroDocumento}`) ?? null;
      return null;
    });
    const necesitanTarifa = inputs.map((i) => i.precioUnitario === undefined || i.precioUnitario === null || String(i.precioUnitario).trim() === '');
    const tarifas = await this.tarifas.deClientes(
      tenantId,
      resueltos.filter((id, n): id is string => Boolean(id) && necesitanTarifa[n]),
    );

    return inputs.map((input, n) => this.prepararUno(input, origen, resueltos[n], necesitanTarifa[n], tarifas, porRef));
  }

  private prepararUno(
    input: ItemFacturableInput,
    origen: OrigenItem,
    clienteId: string | null,
    deTarifa: boolean,
    tarifas: Map<string, TarifaVigente[]>,
    porRef: Map<string, string>,
  ): ItemPreparado {
    const c = input.cliente ?? {};
    const errores: ErrorItem[] = [];
    const metadatos: MetadatosStaging = { ...((input.metadatos ?? {}) as MetadatosStaging) };
    delete metadatos.valoresOriginales;
    const efectivo: ItemFacturableInput = { ...input };

    if (!clienteId && (c.clienteId || c.numeroDocumento || c.referenciaExterna)) {
      errores.push({
        campo: 'cliente',
        mensaje: c.clienteId ? 'El cliente elegido no existe o está inactivo.' : 'Cliente no encontrado: asignalo o crealo.',
      });
    }

    metadatos.precioDeTarifa = deTarifa;
    if (deTarifa) {
      metadatos.descripcionOriginal = input.descripcion;
      if (clienteId) {
        const pedido = metadatos.tarifa ?? {};
        const fechaTarifa = input.periodo?.desde ?? input.fecha ?? hoy();
        const t = TarifasService.elegir(tarifas.get(clienteId), {
          fecha: fechaTarifa,
          origen,
          claveExterna: pedido.claveExterna,
          unidad: input.unidad,
        });
        if (t) {
          efectivo.precioUnitario = t.precioUnitario;
          efectivo.moneda = t.moneda;
          efectivo.alicuotaIva = t.alicuotaIva;
          if (t.descripcion) efectivo.descripcion = descripcionDeTarifa(t.descripcion, pedido.variables ?? {}) || input.descripcion;
          metadatos.tarifaId = t.id;
        } else {
          metadatos.tarifaId = null;
          const unidad = { HORA: 'por hora', MES: 'mensual', SERVICIO: 'por servicio', UNIDAD: 'por unidad' }[input.unidad];
          errores.push({
            campo: 'precioUnitario',
            mensaje: `No hay tarifa ${unidad} vigente al ${fechaTarifa} para este cliente${pedido.claveExterna ? ' y proyecto' : ''}. Cargala en Configuración → Tarifas.`,
          });
        }
      }
    }

    errores.push(...validarItem(efectivo, { exigirPrecio: !deTarifa }).filter((e) => !errores.some((x) => x.campo === e.campo)));

    // Números y fechas inválidos no entran en columnas Decimal/Date: se guarda 0/null y el original en metadatos.
    const originales: Record<string, string> = {};
    const num = (campo: 'cantidad' | 'precioUnitario' | 'alicuotaIva', v: string | undefined, porDefecto: string) => {
      if (v === undefined || v === null || String(v).trim() === '') return porDefecto;
      const d = decimalCanonico(v);
      if (d === null) {
        originales[campo] = String(v);
        return porDefecto;
      }
      return d;
    };
    const fec = (campo: 'fecha' | 'periodoDesde' | 'periodoHasta', v: string | undefined) => {
      const f = fecha(v);
      if (v && !f) originales[campo] = v;
      return f;
    };
    const unidadValida = (['HORA', 'UNIDAD', 'SERVICIO', 'MES'] as string[]).includes(efectivo.unidad);
    if (!unidadValida) originales.unidad = String(efectivo.unidad);
    const data: ItemPreparado['data'] = {
      origen,
      referenciaExterna: input.referenciaExterna.trim(),
      clienteId,
      clienteTipoDocumento: c.numeroDocumento ? ((c.tipoDocumento ?? 'CUIT') as TipoDocumento) : null,
      clienteNumeroDocumento: c.numeroDocumento?.trim() || null,
      clienteReferenciaExterna: c.referenciaExterna?.trim() || null,
      clienteAlta: c.alta ? (c.alta as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
      descripcion: (efectivo.descripcion ?? '').trim().slice(0, 500) || '(sin descripción)',
      cantidad: num('cantidad', efectivo.cantidad, '0'),
      unidad: unidadValida ? efectivo.unidad : 'UNIDAD',
      precioUnitario: num('precioUnitario', efectivo.precioUnitario, '0'),
      moneda: efectivo.moneda === 'USD' ? 'USD' : 'ARS',
      alicuotaIva: num('alicuotaIva', efectivo.alicuotaIva, '21'),
      fecha: fec('fecha', efectivo.fecha),
      periodoDesde: fec('periodoDesde', efectivo.periodo?.desde),
      periodoHasta: fec('periodoHasta', efectivo.periodo?.hasta),
      metadatos: { ...metadatos, ...(Object.keys(originales).length ? { valoresOriginales: originales } : {}) } as Prisma.InputJsonValue,
      estado: errores.length ? 'CON_ERRORES' : 'VALIDO',
      errores: errores.length ? (errores as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
      hashContenido: hashContenido(input),
    };

    const vincular =
      clienteId && c.referenciaExterna && !porRef.has(c.referenciaExterna) && !c.clienteId
        ? { referencia: c.referenciaExterna, clienteId }
        : undefined;
    return { data, estado: data.estado as EstadoItem, vincular };
  }

  /** Ingresa un lote al staging (ARCHITECTURE.md §8.2 paso 1) con idempotencia por (origen, referenciaExterna). */
  async ingresar(
    ctx: ContextoFuente,
    origen: OrigenItem,
    resultado: ResultadoExtraccion,
    extra: { plantillaMapeoId?: string } = {},
  ) {
    const advertencias: Advertencia[] = [...resultado.advertencias];

    // Duplicados dentro del mismo lote: queda el primero.
    const vistos = new Set<string>();
    const inputs = resultado.items.filter((i) => {
      const ref = i.referenciaExterna?.trim();
      if (ref && vistos.has(ref)) {
        advertencias.push({ referencia: ref, mensaje: 'Referencia repetida dentro del mismo archivo o lote: se tomó la primera.' });
        return false;
      }
      if (ref) vistos.add(ref);
      return true;
    });

    const preparados = await this.preparar(ctx.tenantId, origen, inputs);
    const refs = preparados.map((p) => p.data.referenciaExterna);
    const existentes = new Map<string, Pick<ItemFacturable, 'id' | 'estado' | 'hashContenido'>>();
    for (let i = 0; i < refs.length; i += 1000) {
      const filas = await this.prisma.itemFacturable.findMany({
        where: { tenantId: ctx.tenantId, origen, referenciaExterna: { in: refs.slice(i, i + 1000) } },
        select: { id: true, estado: true, hashContenido: true, referenciaExterna: true },
      });
      for (const f of filas) existentes.set(f.referenciaExterna, f);
    }

    let duplicados = 0;
    let actualizados = 0;
    let validos = 0;
    let conErrores = 0;
    const crear: ItemPreparado[] = [];
    const actualizar: Array<{ id: string; p: ItemPreparado }> = [];
    for (const p of preparados) {
      const ref = p.data.referenciaExterna;
      const existente = existentes.get(ref);
      if (!existente) {
        crear.push(p);
      } else if (existente.hashContenido === p.data.hashContenido) {
        duplicados++;
        continue;
      } else if (existente.estado === 'FACTURADO') {
        conErrores++;
        advertencias.push({ referencia: ref, mensaje: 'Ya fue facturado y el origen trae datos distintos: si corresponde, emití una nota de crédito o débito.' });
        continue;
      } else if (existente.estado === 'EN_BORRADOR') {
        conErrores++;
        advertencias.push({ referencia: ref, mensaje: 'Está en un borrador y el origen trae datos distintos: eliminá el borrador y volvé a importar para actualizarlo.' });
        continue;
      } else {
        actualizar.push({ id: existente.id, p });
        actualizados++;
      }
      if (p.estado === 'VALIDO') validos++;
      else conErrores++;
    }

    const importacion = await this.prisma.$transaction(async (tx) => {
      const imp = await tx.importacion.create({
        data: {
          tenantId: ctx.tenantId,
          origen,
          descripcion: resultado.descripcionLote.slice(0, 200),
          archivoSha256: resultado.archivoSha256 ?? null,
          plantillaMapeoId: extra.plantillaMapeoId ?? null,
          integracionId: ctx.integracionId ?? null,
          parametros: (resultado.parametros ?? Prisma.DbNull) as Prisma.InputJsonValue,
          advertencias: advertencias.length ? (advertencias.slice(0, 500) as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
          totalItems: resultado.items.length,
          validos,
          conErrores,
          duplicados,
          actualizados,
          creadaPorId: ctx.usuarioId ?? null,
        },
      });
      if (crear.length) {
        await tx.itemFacturable.createMany({
          data: crear.map((p) => ({ ...p.data, tenantId: ctx.tenantId, importacionId: imp.id })),
        });
      }
      for (const { id, p } of actualizar) {
        await tx.itemFacturable.update({ where: { id }, data: { ...p.data, importacionId: imp.id, comprobanteId: null } });
      }
      return imp;
    }, { timeout: 60_000 });

    await this.vincularReferencias(ctx.tenantId, origen, preparados);
    return importacion;
  }

  async vincularReferencias(tenantId: string, origen: OrigenItem, preparados: ItemPreparado[]) {
    const pares = new Map(preparados.filter((p) => p.vincular).map((p) => [p.vincular!.referencia, p.vincular!.clienteId]));
    for (const [ref, clienteId] of pares) await this.clientes.vincularReferencia(tenantId, origen, ref, clienteId);
  }
}
