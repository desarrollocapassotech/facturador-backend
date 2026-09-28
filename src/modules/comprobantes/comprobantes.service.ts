import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, type ConceptoArca, type TipoComprobante } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import type { AuthContext } from '../auth';
import { ClientesService } from '../clientes';
import { TenantsService } from '../tenants';
import { TIPOS_COMPROBANTE, tipoComprobante, type Letra } from './domain/codigos';
import { deYmdArca, hoyArgentina } from './domain/fechas';
import { sugerirLetra } from './domain/letra-sugerida';
import { calcularTotales, TotalesInvalidosError } from './domain/totales';
import {
  ActualizarBorradorDto,
  CrearBorradorDto,
  CrearNotaDto,
  LineaDto,
  ListarComprobantesQuery,
} from './dto/comprobantes.dto';

const EDITABLES = ['BORRADOR', 'RECHAZADO'] as const;

const INCLUDE_DETALLE = {
  lineas: { orderBy: { orden: 'asc' } },
  alicuotas: { orderBy: { arcaId: 'asc' } },
  cliente: true,
  puntoVenta: true,
  asociado: { select: { id: true, tipo: true, numero: true, fechaEmision: true, importeTotal: true, puntoVenta: { select: { numero: true } } } },
  asociadosDesde: { select: { id: true, tipo: true, numero: true, estado: true, importeTotal: true } },
} satisfies Prisma.ComprobanteInclude;

export type ComprobanteDetalle = Prisma.ComprobanteGetPayload<{ include: typeof INCLUDE_DETALLE }>;

interface DatosBorrador {
  concepto: ConceptoArca;
  fechaServicioDesde: string | null;
  fechaServicioHasta: string | null;
  fechaVtoPago: string | null;
}

function fecha(v: string | null | undefined): Date | null {
  return v ? deYmdArca(v) : null;
}

function aYmd(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

/** Servicios exigen período y vencimiento (ARCA 10049). Se valida al guardar si vienen completos, y al emitir siempre. */
export function validarFechasServicio(d: DatosBorrador, exigir: boolean): void {
  if (d.concepto === 'PRODUCTOS') return;
  const faltan = !d.fechaServicioDesde || !d.fechaServicioHasta || !d.fechaVtoPago;
  if (faltan) {
    if (exigir) {
      throw new BadRequestException('Para servicios hay que indicar período facturado (desde / hasta) y vencimiento de pago.');
    }
    return;
  }
  if (d.fechaServicioDesde! > d.fechaServicioHasta!) {
    throw new BadRequestException('La fecha "desde" del período no puede ser posterior a "hasta".');
  }
}

@Injectable()
export class ComprobantesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clientes: ClientesService,
    private readonly tenants: TenantsService,
  ) {}

  // ── Consultas ────────────────────────────────────────────────────────────

  async listar(tenantId: string, q: ListarComprobantesQuery) {
    const porPagina = q.porPagina ?? 25;
    const pagina = q.pagina ?? 1;
    const where: Prisma.ComprobanteWhereInput = {
      tenantId,
      ...(q.estado ? { estado: q.estado } : {}),
      ...(q.clienteId ? { clienteId: q.clienteId } : {}),
    };
    const [total, items] = await Promise.all([
      this.prisma.comprobante.count({ where }),
      this.prisma.comprobante.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: (pagina - 1) * porPagina,
        take: porPagina,
        select: {
          id: true,
          tipo: true,
          estado: true,
          ambiente: true,
          numero: true,
          fechaEmision: true,
          moneda: true,
          importeTotal: true,
          cae: true,
          errorMensaje: true,
          createdAt: true,
          cliente: { select: { id: true, razonSocial: true } },
          puntoVenta: { select: { numero: true } },
        },
      }),
    ]);
    return { total, pagina, porPagina, items };
  }

  async obtener(tenantId: string, id: string) {
    const c = await this.buscar(tenantId, id);
    const emisor = await this.tenants.obtenerEmisor(tenantId);
    const letraSugerida = sugerirLetra(emisor.condicionIva, c.cliente.condicionIva);
    const letra = TIPOS_COMPROBANTE[c.tipo].letra;
    return {
      ...c,
      letraSugerida,
      advertenciaLetra:
        !c.asociadoId && letra !== letraSugerida
          ? `Para un emisor ${emisor.condicionIva.replace(/_/g, ' ').toLowerCase()} y un cliente ${c.cliente.condicionIva
              .replace(/_/g, ' ')
              .toLowerCase()} lo habitual es Factura ${letraSugerida}. Si ARCA no acepta la letra elegida, va a rechazar el comprobante.`
          : null,
    };
  }

  async buscar(tenantId: string, id: string): Promise<ComprobanteDetalle> {
    const c = await this.prisma.comprobante.findUnique({
      where: { tenantId_id: { tenantId, id } },
      include: INCLUDE_DETALLE,
    });
    if (!c) throw new NotFoundException('Comprobante no encontrado.');
    return c;
  }

  // ── Borradores ───────────────────────────────────────────────────────────

  async crearBorrador(auth: AuthContext, dto: CrearBorradorDto) {
    const emisor = await this.tenants.obtenerEmisor(auth.tenantId);
    const cliente = await this.clientes.obtener(auth.tenantId, dto.clienteId);
    const pv = await this.puntoVentaValido(auth.tenantId, dto.puntoVentaId, emisor.ambienteArca);
    const tipo = dto.tipo ?? tipoComprobante(sugerirLetra(emisor.condicionIva, cliente.condicionIva), 'FACTURA');

    const datos = {
      concepto: dto.concepto,
      fechaServicioDesde: dto.fechaServicioDesde ?? null,
      fechaServicioHasta: dto.fechaServicioHasta ?? null,
      fechaVtoPago: dto.fechaVtoPago ?? null,
    };
    validarFechasServicio(datos, false);
    const calculo = this.calcular(dto.lineas, TIPOS_COMPROBANTE[tipo].letra);

    const creado = await this.prisma.comprobante.create({
      data: {
        tenantId: auth.tenantId,
        tipo,
        ambiente: emisor.ambienteArca,
        clienteId: cliente.id,
        puntoVentaId: pv.id,
        fechaEmision: deYmdArca(dto.fechaEmision),
        concepto: dto.concepto,
        fechaServicioDesde: fecha(datos.fechaServicioDesde),
        fechaServicioHasta: fecha(datos.fechaServicioHasta),
        fechaVtoPago: fecha(datos.fechaVtoPago),
        moneda: dto.moneda ?? cliente.monedaPreferida,
        cancelaMismaMoneda: dto.cancelaMismaMoneda ?? false,
        observaciones: dto.observaciones?.trim() || null,
        creadoPorId: auth.usuarioId ?? null,
        ...calculo.totales,
        // tenantId de líneas y alícuotas sale de la FK compuesta con el comprobante.
        lineas: { create: calculo.lineas },
        alicuotas: { create: calculo.alicuotas },
      },
    });
    return this.obtener(auth.tenantId, creado.id);
  }

  async actualizarBorrador(auth: AuthContext, id: string, dto: ActualizarBorradorDto) {
    const actual = await this.buscar(auth.tenantId, id);
    if (!EDITABLES.includes(actual.estado as (typeof EDITABLES)[number])) {
      throw new ConflictException('Solo se pueden editar borradores o comprobantes rechazados.');
    }
    if (actual.version !== dto.version) {
      throw new ConflictException('El comprobante cambió mientras lo editabas. Recargalo y volvé a intentar.');
    }

    const emisor = await this.tenants.obtenerEmisor(auth.tenantId);
    const clienteId = dto.clienteId ?? actual.clienteId;
    if (actual.asociadoId && dto.clienteId && dto.clienteId !== actual.clienteId) {
      throw new BadRequestException('Una nota de crédito o débito tiene que ser para el mismo cliente que la factura.');
    }
    const cliente = await this.clientes.obtener(auth.tenantId, clienteId);
    const pv = dto.puntoVentaId
      ? await this.puntoVentaValido(auth.tenantId, dto.puntoVentaId, emisor.ambienteArca)
      : actual.puntoVenta;

    let tipo: TipoComprobante = dto.tipo ?? actual.tipo;
    if (dto.tipo && dto.tipo !== actual.tipo) {
      const nuevo = TIPOS_COMPROBANTE[dto.tipo];
      const viejo = TIPOS_COMPROBANTE[actual.tipo];
      if (actual.asociadoId) {
        throw new BadRequestException('La letra de una nota la define la factura asociada.');
      }
      if (nuevo.clase !== viejo.clase) {
        throw new BadRequestException('No se puede convertir una factura en nota (ni al revés).');
      }
      tipo = dto.tipo;
    }

    const datos = {
      concepto: dto.concepto ?? actual.concepto,
      fechaServicioDesde: dto.fechaServicioDesde !== undefined ? dto.fechaServicioDesde : aYmd(actual.fechaServicioDesde),
      fechaServicioHasta: dto.fechaServicioHasta !== undefined ? dto.fechaServicioHasta : aYmd(actual.fechaServicioHasta),
      fechaVtoPago: dto.fechaVtoPago !== undefined ? dto.fechaVtoPago : aYmd(actual.fechaVtoPago),
    };
    validarFechasServicio(datos, false);

    const lineas: LineaDto[] =
      dto.lineas ??
      actual.lineas.map((l) => ({
        descripcion: l.descripcion,
        cantidad: l.cantidad.toString(),
        unidad: l.unidad,
        precioUnitario: l.precioUnitario.toString(),
        bonificacionPct: l.bonificacionPct.toString(),
        alicuotaIva: l.alicuotaIva.toString(),
      }));
    const calculo = this.calcular(lineas, TIPOS_COMPROBANTE[tipo].letra);

    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.comprobante.updateMany({
        where: { tenantId: auth.tenantId, id, version: dto.version, estado: { in: [...EDITABLES] } },
        data: {
          tipo,
          clienteId: cliente.id,
          puntoVentaId: pv.id,
          fechaEmision: dto.fechaEmision ? deYmdArca(dto.fechaEmision) : undefined,
          concepto: datos.concepto,
          fechaServicioDesde: fecha(datos.fechaServicioDesde),
          fechaServicioHasta: fecha(datos.fechaServicioHasta),
          fechaVtoPago: fecha(datos.fechaVtoPago),
          moneda: dto.moneda,
          cancelaMismaMoneda: dto.cancelaMismaMoneda,
          observaciones: dto.observaciones === undefined ? undefined : dto.observaciones?.trim() || null,
          motivo: dto.motivo === undefined ? undefined : dto.motivo?.trim() || null,
          version: { increment: 1 },
          ...calculo.totales,
        },
      });
      if (!count) {
        throw new ConflictException('El comprobante cambió mientras lo editabas. Recargalo y volvé a intentar.');
      }
      await tx.comprobanteLinea.deleteMany({ where: { tenantId: auth.tenantId, comprobanteId: id } });
      await tx.comprobanteAlicuota.deleteMany({ where: { tenantId: auth.tenantId, comprobanteId: id } });
      await tx.comprobanteLinea.createMany({
        data: calculo.lineas.map((l) => ({ ...l, tenantId: auth.tenantId, comprobanteId: id })),
      });
      if (calculo.alicuotas.length) {
        await tx.comprobanteAlicuota.createMany({
          data: calculo.alicuotas.map((a) => ({ ...a, tenantId: auth.tenantId, comprobanteId: id })),
        });
      }
    });
    return this.obtener(auth.tenantId, id);
  }

  async eliminar(tenantId: string, id: string) {
    const c = await this.buscar(tenantId, id);
    if (!EDITABLES.includes(c.estado as (typeof EDITABLES)[number]) || c.numero !== null || c.numeroReservado !== null) {
      throw new ConflictException('Solo se pueden eliminar borradores que nunca fueron autorizados.');
    }
    const intentos = await this.prisma.arcaLog.count({ where: { tenantId, comprobanteId: id } });
    if (intentos > 0) {
      throw new ConflictException('Este comprobante tiene intentos de emisión registrados en ARCA: no se puede eliminar.');
    }
    await this.prisma.comprobante.delete({ where: { tenantId_id: { tenantId, id } } });
  }

  // ── Notas de crédito / débito ────────────────────────────────────────────

  async crearNota(auth: AuthContext, facturaId: string, dto: CrearNotaDto) {
    const factura = await this.buscar(auth.tenantId, facturaId);
    if (TIPOS_COMPROBANTE[factura.tipo].clase !== 'FACTURA') {
      throw new BadRequestException('Las notas se emiten asociadas a una factura.');
    }
    if (factura.estado !== 'EMITIDO') {
      throw new BadRequestException('Solo se pueden hacer notas sobre facturas emitidas y no anuladas.');
    }
    const letra = TIPOS_COMPROBANTE[factura.tipo].letra;
    const tipo = tipoComprobante(letra, dto.clase);
    const lineas = factura.lineas.map((l) => ({
      orden: l.orden,
      descripcion: l.descripcion,
      cantidad: l.cantidad,
      unidad: l.unidad,
      precioUnitario: l.precioUnitario,
      bonificacionPct: l.bonificacionPct,
      alicuotaIva: l.alicuotaIva,
      importeNeto: l.importeNeto,
      importeIva: l.importeIva,
      importeTotal: l.importeTotal,
    }));

    const nota = await this.prisma.comprobante.create({
      data: {
        tenantId: auth.tenantId,
        tipo,
        ambiente: factura.ambiente,
        clienteId: factura.clienteId,
        puntoVentaId: factura.puntoVentaId,
        fechaEmision: deYmdArca(hoyArgentina()),
        concepto: factura.concepto,
        fechaServicioDesde: factura.fechaServicioDesde,
        fechaServicioHasta: factura.fechaServicioHasta,
        fechaVtoPago: factura.fechaVtoPago,
        moneda: factura.moneda,
        cancelaMismaMoneda: factura.cancelaMismaMoneda,
        importeNetoGravado: factura.importeNetoGravado,
        importeNoGravado: factura.importeNoGravado,
        importeExento: factura.importeExento,
        importeIva: factura.importeIva,
        importeTributos: factura.importeTributos,
        importeTotal: factura.importeTotal,
        asociadoId: factura.id,
        motivo: dto.motivo.trim(),
        creadoPorId: auth.usuarioId ?? null,
        lineas: { create: lineas },
        alicuotas: {
          create: factura.alicuotas.map((a) => ({
            arcaId: a.arcaId,
            baseImponible: a.baseImponible,
            importe: a.importe,
          })),
        },
      },
    });
    return this.obtener(auth.tenantId, nota.id);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private async puntoVentaValido(tenantId: string, id: string, ambiente: 'HOMOLOGACION' | 'PRODUCCION') {
    const pv = await this.prisma.puntoVenta.findUnique({ where: { tenantId_id: { tenantId, id } } });
    if (!pv) throw new BadRequestException('El punto de venta no existe.');
    if (!pv.activo) throw new BadRequestException(`El punto de venta ${pv.numero} está desactivado.`);
    if (pv.ambiente !== ambiente) {
      throw new BadRequestException(
        `El punto de venta ${pv.numero} es de ${pv.ambiente.toLowerCase()} y la empresa está en ${ambiente.toLowerCase()}.`,
      );
    }
    return pv;
  }

  private calcular(lineas: LineaDto[], letra: Letra) {
    try {
      const t = calcularTotales(lineas, letra);
      return {
        totales: {
          importeNetoGravado: t.importeNetoGravado.toFixed(2),
          importeNoGravado: t.importeNoGravado.toFixed(2),
          importeExento: t.importeExento.toFixed(2),
          importeIva: t.importeIva.toFixed(2),
          importeTributos: t.importeTributos.toFixed(2),
          importeTotal: t.importeTotal.toFixed(2),
        },
        lineas: lineas.map((l, i) => ({
          orden: i + 1,
          descripcion: l.descripcion.trim(),
          cantidad: l.cantidad,
          unidad: l.unidad,
          precioUnitario: l.precioUnitario,
          bonificacionPct: l.bonificacionPct ?? '0',
          alicuotaIva: l.alicuotaIva,
          importeNeto: t.lineas[i].importeNeto.toFixed(2),
          importeIva: t.lineas[i].importeIva.toFixed(2),
          importeTotal: t.lineas[i].importeTotal.toFixed(2),
        })),
        alicuotas: t.alicuotas.map((a) => ({
          arcaId: a.arcaId,
          baseImponible: a.baseImponible.toFixed(2),
          importe: a.importe.toFixed(2),
        })),
      };
    } catch (err) {
      if (err instanceof TotalesInvalidosError) throw new UnprocessableEntityException(err.message);
      throw err;
    }
  }
}
