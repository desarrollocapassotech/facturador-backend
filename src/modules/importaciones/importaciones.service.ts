import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type EstadoItem, type ItemFacturable } from '@prisma/client';
import Decimal from 'decimal.js';
import { PrismaService } from '../../shared/prisma/prisma.service';
import type { AuthContext } from '../auth';
import { ExcelCsvAdapter } from './adapters/excel/excel.adapter';
import { PlantillasMapeoService } from './adapters/excel/plantillas-mapeo.service';
import { TrackerAdapter } from './adapters/tracker/tracker.adapter';
import type { ParametrosTracker } from './adapters/tracker/tracker.types';
import type { ItemFacturableInput } from './domain/item-facturable';
import { EditarItemDto, ItemManualDto, ListarItemsQuery } from './dto/importaciones.dto';
import { inputDeItem, StagingService, type MetadatosStaging } from './staging.service';

const EDITABLES: EstadoItem[] = ['VALIDO', 'CON_ERRORES'];

const INCLUDE_ITEM = { cliente: { select: { id: true, razonSocial: true } } } as const;
type ItemPublico = Prisma.ItemFacturableGetPayload<{ include: typeof INCLUDE_ITEM }>;

function ctx(auth: AuthContext) {
  return { tenantId: auth.tenantId, usuarioId: auth.usuarioId, integracionId: auth.integracionId };
}

@Injectable()
export class ImportacionesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly staging: StagingService,
    private readonly tracker: TrackerAdapter,
    private readonly excel: ExcelCsvAdapter,
    private readonly plantillas: PlantillasMapeoService,
  ) {}

  // ── Consultas ────────────────────────────────────────────────────────────

  async listar(tenantId: string, pagina = 1) {
    const porPagina = 25;
    const [total, items] = await Promise.all([
      this.prisma.importacion.count({ where: { tenantId } }),
      this.prisma.importacion.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        skip: (pagina - 1) * porPagina,
        take: porPagina,
      }),
    ]);
    return { total, pagina, porPagina, items };
  }

  async obtener(tenantId: string, id: string) {
    const imp = await this.prisma.importacion.findUnique({ where: { tenantId_id: { tenantId, id } } });
    if (!imp) throw new NotFoundException('Importación no encontrada.');
    const porEstado = await this.prisma.itemFacturable.groupBy({ by: ['estado'], where: { tenantId, importacionId: id }, _count: true });
    return { ...imp, estadosItems: Object.fromEntries(porEstado.map((e) => [e.estado, e._count])) };
  }

  async items(tenantId: string, q: ListarItemsQuery) {
    const porPagina = q.porPagina ?? 100;
    const pagina = q.pagina ?? 1;
    const where: Prisma.ItemFacturableWhereInput = {
      tenantId,
      ...(q.importacionId ? { importacionId: q.importacionId } : {}),
      ...(q.estado ? { estado: q.estado } : {}),
      ...(q.clienteId ? { clienteId: q.clienteId } : {}),
    };
    const [total, items] = await Promise.all([
      this.prisma.itemFacturable.count({ where }),
      this.prisma.itemFacturable.findMany({
        where,
        include: INCLUDE_ITEM,
        orderBy: [{ estado: 'asc' }, { createdAt: 'asc' }, { referenciaExterna: 'asc' }],
        skip: (pagina - 1) * porPagina,
        take: porPagina,
      }),
    ]);
    return { total, pagina, porPagina, items };
  }

  // ── Ingreso ──────────────────────────────────────────────────────────────

  async importarTracker(auth: AuthContext, p: ParametrosTracker) {
    const resultado = await this.tracker.extraer(ctx(auth), p);
    return this.obtener(auth.tenantId, (await this.staging.ingresar(ctx(auth), 'TRACKER', resultado)).id);
  }

  async importarExcel(auth: AuthContext, archivo: { buffer: Buffer; nombre: string }, plantillaMapeoId: string) {
    const plantilla = await this.plantillas.obtener(auth.tenantId, plantillaMapeoId);
    const resultado = await this.excel.extraer(ctx(auth), { archivo: archivo.buffer, nombre: archivo.nombre, plantilla });
    const repetido = await this.prisma.importacion.findFirst({
      where: { tenantId: auth.tenantId, archivoSha256: resultado.archivoSha256, estado: { not: 'DESCARTADA' } },
      select: { createdAt: true },
    });
    if (repetido) {
      resultado.advertencias.unshift({
        mensaje: `Este mismo archivo ya se importó el ${repetido.createdAt.toISOString().slice(0, 10)}: las filas iguales se marcaron como duplicadas.`,
      });
    }
    const imp = await this.staging.ingresar(ctx(auth), 'EXCEL', resultado, { plantillaMapeoId: plantilla.id });
    return this.obtener(auth.tenantId, imp.id);
  }

  async importarManual(auth: AuthContext, items: ItemManualDto[], descripcion?: string) {
    const inputs: ItemFacturableInput[] = items.map((i) => ({
      origen: 'MANUAL',
      referenciaExterna: i.referenciaExterna,
      cliente: { clienteId: i.clienteId },
      descripcion: i.descripcion,
      cantidad: i.cantidad,
      unidad: i.unidad,
      ...(i.precioUnitario ? { precioUnitario: i.precioUnitario } : {}),
      ...(i.moneda ? { moneda: i.moneda } : {}),
      ...(i.alicuotaIva ? { alicuotaIva: i.alicuotaIva } : {}),
      ...(i.fecha ? { fecha: i.fecha } : {}),
      ...(i.periodoDesde && i.periodoHasta ? { periodo: { desde: i.periodoDesde, hasta: i.periodoHasta } } : {}),
    }));
    const imp = await this.staging.ingresar(ctx(auth), 'MANUAL', { items: inputs, advertencias: [], descripcionLote: descripcion?.trim() || 'Carga manual' });
    return this.obtener(auth.tenantId, imp.id);
  }

  // ── Estado del lote ──────────────────────────────────────────────────────

  async confirmar(tenantId: string, id: string) {
    const { count } = await this.prisma.importacion.updateMany({
      where: { tenantId, id, estado: 'EN_STAGING' },
      data: { estado: 'CONFIRMADA', confirmadaEn: new Date() },
    });
    if (!count) await this.exigirEstado(tenantId, id, 'EN_STAGING');
    await this.recontar(tenantId, id);
    return this.obtener(tenantId, id);
  }

  async descartar(tenantId: string, id: string) {
    const imp = await this.obtener(tenantId, id);
    if (imp.estado === 'DESCARTADA') return imp;
    await this.prisma.$transaction([
      this.prisma.itemFacturable.updateMany({
        where: { tenantId, importacionId: id, estado: { in: ['VALIDO', 'CON_ERRORES'] } },
        data: { estado: 'DESCARTADO' },
      }),
      this.prisma.importacion.update({ where: { tenantId_id: { tenantId, id } }, data: { estado: 'DESCARTADA' } }),
    ]);
    return this.obtener(tenantId, id);
  }

  // ── Edición de ítems en el staging ───────────────────────────────────────

  async editarItem(tenantId: string, id: string, dto: EditarItemDto): Promise<ItemPublico & { actualizadosConElMismoCliente?: number }> {
    const item = await this.item(tenantId, id);
    if (!EDITABLES.includes(item.estado)) throw new ConflictException('Solo se pueden editar ítems válidos o con errores.');

    const input = inputDeItem(item);
    const m = { ...((item.metadatos ?? {}) as MetadatosStaging) };
    if (dto.descripcion !== undefined) {
      input.descripcion = dto.descripcion;
      m.descripcionOriginal = dto.descripcion;
    }
    if (dto.cantidad !== undefined) input.cantidad = dto.cantidad;
    if (dto.unidad !== undefined) input.unidad = dto.unidad;
    if (dto.fecha !== undefined) input.fecha = dto.fecha ?? undefined;
    if (dto.periodoDesde !== undefined || dto.periodoHasta !== undefined) {
      const desde = dto.periodoDesde ?? input.periodo?.desde;
      const hasta = dto.periodoHasta ?? input.periodo?.hasta;
      input.periodo = desde && hasta ? { desde, hasta } : undefined;
    }
    if (dto.precioUnitario !== undefined) {
      // null = volver a tomar el precio de la tarifa
      if (dto.precioUnitario === null) {
        delete input.precioUnitario;
        delete input.moneda;
        delete input.alicuotaIva;
      } else {
        input.precioUnitario = dto.precioUnitario;
        input.moneda = dto.moneda ?? input.moneda ?? item.moneda;
        input.alicuotaIva = dto.alicuotaIva ?? input.alicuotaIva ?? item.alicuotaIva.toString();
      }
    } else if (!m.precioDeTarifa) {
      if (dto.moneda !== undefined) input.moneda = dto.moneda;
      if (dto.alicuotaIva !== undefined) input.alicuotaIva = dto.alicuotaIva;
    }
    if (dto.baseHoras !== undefined) {
      if (item.origen !== 'TRACKER' || item.unidad !== 'HORA') throw new BadRequestException('La base de horas solo aplica a ítems por hora del tracker.');
      const horas = dto.baseHoras === 'TRABAJADAS' ? m.horasTrabajadas : m.horasFacturables;
      input.cantidad = new Decimal(String(horas ?? '0')).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toString();
      m.baseHoras = dto.baseHoras;
    }
    input.metadatos = m;

    if (dto.clienteId !== undefined) return this.asignarCliente(tenantId, item, dto.clienteId, input);
    await this.guardarRevalidado(tenantId, item, input);
    return this.itemPublico(tenantId, id);
  }

  async descartarItem(tenantId: string, id: string) {
    const item = await this.item(tenantId, id);
    if (!EDITABLES.includes(item.estado)) throw new ConflictException('Solo se pueden descartar ítems válidos o con errores.');
    await this.prisma.itemFacturable.update({ where: { id }, data: { estado: 'DESCARTADO' } });
    await this.recontar(tenantId, item.importacionId);
    return this.itemPublico(tenantId, id);
  }

  async restaurarItem(tenantId: string, id: string) {
    const item = await this.item(tenantId, id);
    if (item.estado !== 'DESCARTADO') throw new ConflictException('El ítem no está descartado.');
    await this.guardarRevalidado(tenantId, item, inputDeItem(item));
    return this.itemPublico(tenantId, id);
  }

  /**
   * Asigna el cliente al ítem y a los demás ítems pendientes del mismo cliente externo, y recuerda
   * la relación para las próximas importaciones.
   */
  private async asignarCliente(tenantId: string, item: ItemFacturable, clienteId: string | null, input: ItemFacturableInput) {
    if (!clienteId) throw new BadRequestException('Elegí un cliente.');
    const existe = await this.prisma.cliente.count({ where: { tenantId, id: clienteId, activo: true } });
    if (!existe) throw new NotFoundException('Cliente no encontrado o inactivo.');

    const hermanos = item.clienteReferenciaExterna
      ? await this.prisma.itemFacturable.findMany({
          where: {
            tenantId,
            origen: item.origen,
            clienteReferenciaExterna: item.clienteReferenciaExterna,
            estado: { in: EDITABLES },
            id: { not: item.id },
          },
        })
      : [];
    await this.guardarRevalidado(tenantId, item, { ...input, cliente: { ...input.cliente, clienteId } });
    for (const h of hermanos) {
      const hi = inputDeItem(h);
      await this.guardarRevalidado(tenantId, h, { ...hi, cliente: { ...hi.cliente, clienteId } });
    }
    if (item.clienteReferenciaExterna) {
      await this.prisma.clienteReferenciaExterna.upsert({
        where: { tenantId_origen_referenciaExterna: { tenantId, origen: item.origen, referenciaExterna: item.clienteReferenciaExterna } },
        create: { tenantId, origen: item.origen, referenciaExterna: item.clienteReferenciaExterna, clienteId },
        update: { clienteId },
      });
    }
    return { ...(await this.itemPublico(tenantId, item.id)), actualizadosConElMismoCliente: hermanos.length };
  }

  private async guardarRevalidado(tenantId: string, item: ItemFacturable, input: ItemFacturableInput) {
    const [p] = await this.staging.preparar(tenantId, item.origen, [input]);
    // El hash queda el del dato de origen: si se reimporta igual, no pisa la corrección del usuario.
    const data: Partial<typeof p.data> = { ...p.data };
    delete data.referenciaExterna;
    delete data.origen;
    delete data.hashContenido;
    await this.prisma.itemFacturable.update({ where: { id: item.id }, data });
    await this.recontar(tenantId, item.importacionId);
  }

  /** Actualiza los contadores del lote según el estado actual de sus ítems. */
  private async recontar(tenantId: string, importacionId: string | null) {
    if (!importacionId) return;
    const porEstado = await this.prisma.itemFacturable.groupBy({ by: ['estado'], where: { tenantId, importacionId }, _count: true });
    const n = (e: EstadoItem) => porEstado.find((x) => x.estado === e)?._count ?? 0;
    await this.prisma.importacion.update({
      where: { tenantId_id: { tenantId, id: importacionId } },
      data: { validos: n('VALIDO') + n('EN_BORRADOR') + n('FACTURADO'), conErrores: n('CON_ERRORES') },
    });
  }

  private async item(tenantId: string, id: string) {
    const item = await this.prisma.itemFacturable.findUnique({ where: { tenantId_id: { tenantId, id } } });
    if (!item) throw new NotFoundException('Ítem no encontrado.');
    return item;
  }

  private itemPublico(tenantId: string, id: string) {
    return this.prisma.itemFacturable.findUniqueOrThrow({ where: { tenantId_id: { tenantId, id } }, include: INCLUDE_ITEM });
  }

  private async exigirEstado(tenantId: string, id: string, estado: string) {
    const imp = await this.obtener(tenantId, id);
    if (imp.estado !== estado) throw new ConflictException(`La importación está ${imp.estado.toLowerCase().replace('_', ' ')}.`);
  }
}
