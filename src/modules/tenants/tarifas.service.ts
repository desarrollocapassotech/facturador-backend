import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { OrigenItem, Tarifa, UnidadItem } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { ActualizarTarifaDto, CrearTarifaDto } from './dto/tarifas.dto';
import { elegirTarifa, type TarifaCandidata } from './tarifas';

function aFecha(v: string): Date {
  return new Date(`${v}T00:00:00Z`);
}

function ymd(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

export type TarifaVigente = TarifaCandidata & { clienteId: string };

function aCandidata(t: Tarifa): TarifaVigente {
  return {
    id: t.id,
    clienteId: t.clienteId,
    origen: t.origen,
    claveExterna: t.claveExterna,
    descripcion: t.descripcion,
    unidad: t.unidad,
    precioUnitario: t.precioUnitario.toString(),
    moneda: t.moneda,
    alicuotaIva: t.alicuotaIva.toString(),
    vigenteDesde: ymd(t.vigenteDesde) as string,
    vigenteHasta: ymd(t.vigenteHasta),
  };
}

@Injectable()
export class TarifasService {
  constructor(private readonly prisma: PrismaService) {}

  listar(tenantId: string, clienteId?: string) {
    return this.prisma.tarifa.findMany({
      where: { tenantId, ...(clienteId ? { clienteId } : {}) },
      include: { cliente: { select: { id: true, razonSocial: true } } },
      orderBy: [{ clienteId: 'asc' }, { vigenteDesde: 'desc' }],
    });
  }

  async crear(tenantId: string, dto: CrearTarifaDto) {
    this.validarVigencia(dto.vigenteDesde, dto.vigenteHasta ?? null);
    const cliente = await this.prisma.cliente.count({ where: { tenantId, id: dto.clienteId } });
    if (!cliente) throw new NotFoundException('Cliente no encontrado.');
    return this.prisma.tarifa.create({
      data: {
        tenantId,
        clienteId: dto.clienteId,
        origen: dto.origen ?? null,
        claveExterna: dto.claveExterna || null,
        descripcion: dto.descripcion || null,
        unidad: dto.unidad,
        precioUnitario: dto.precioUnitario,
        moneda: dto.moneda,
        alicuotaIva: dto.alicuotaIva,
        vigenteDesde: aFecha(dto.vigenteDesde),
        vigenteHasta: dto.vigenteHasta ? aFecha(dto.vigenteHasta) : null,
      },
      include: { cliente: { select: { id: true, razonSocial: true } } },
    });
  }

  async actualizar(tenantId: string, id: string, dto: ActualizarTarifaDto) {
    const actual = await this.prisma.tarifa.findFirst({ where: { tenantId, id } });
    if (!actual) throw new NotFoundException('Tarifa no encontrada.');
    const desde = dto.vigenteDesde ?? (ymd(actual.vigenteDesde) as string);
    const hasta = dto.vigenteHasta !== undefined ? dto.vigenteHasta : ymd(actual.vigenteHasta);
    this.validarVigencia(desde, hasta);
    return this.prisma.tarifa.update({
      where: { id },
      data: {
        descripcion: dto.descripcion === undefined ? undefined : dto.descripcion || null,
        precioUnitario: dto.precioUnitario,
        alicuotaIva: dto.alicuotaIva,
        vigenteDesde: aFecha(desde),
        vigenteHasta: hasta ? aFecha(hasta) : null,
      },
      include: { cliente: { select: { id: true, razonSocial: true } } },
    });
  }

  async eliminar(tenantId: string, id: string) {
    const { count } = await this.prisma.tarifa.deleteMany({ where: { tenantId, id } });
    if (!count) throw new NotFoundException('Tarifa no encontrada.');
  }

  /** Tarifas de varios clientes de una sola vez (para resolver un lote sin N consultas). */
  async deClientes(tenantId: string, clienteIds: string[]): Promise<Map<string, TarifaVigente[]>> {
    const tarifas = clienteIds.length
      ? await this.prisma.tarifa.findMany({ where: { tenantId, clienteId: { in: [...new Set(clienteIds)] } } })
      : [];
    const porCliente = new Map<string, TarifaVigente[]>();
    for (const t of tarifas) {
      const lista = porCliente.get(t.clienteId) ?? [];
      lista.push(aCandidata(t));
      porCliente.set(t.clienteId, lista);
    }
    return porCliente;
  }

  static elegir(tarifas: TarifaVigente[] | undefined, criterio: { fecha: string; origen?: OrigenItem; claveExterna?: string; unidad?: UnidadItem }) {
    return elegirTarifa(tarifas ?? [], criterio);
  }

  private validarVigencia(desde: string, hasta: string | null) {
    if (hasta && hasta < desde) throw new BadRequestException('La vigencia "hasta" no puede ser anterior a "desde".');
  }
}
