import { ConflictException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';

type Tx = Prisma.TransactionClient;

/**
 * Lo único que `comprobantes` usa de `importaciones` (ARCHITECTURE.md §4): elegir ítems para
 * borradores y moverlos de estado. Los métodos que escriben aceptan la transacción del llamador.
 */
@Injectable()
export class ItemsFacturablesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Ítems VALIDO listos para un borrador: de lotes confirmados (o sin lote). */
  paraBorradores(tenantId: string, filtro: { itemIds?: string[]; importacionId?: string }) {
    return this.prisma.itemFacturable.findMany({
      where: {
        tenantId,
        estado: 'VALIDO',
        clienteId: { not: null },
        ...(filtro.itemIds ? { id: { in: filtro.itemIds } } : {}),
        ...(filtro.importacionId ? { importacionId: filtro.importacionId } : {}),
        OR: [{ importacionId: null }, { importacion: { estado: 'CONFIRMADA' } }],
      },
      orderBy: [{ clienteId: 'asc' }, { periodoDesde: 'asc' }, { fecha: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /** Asigna los ítems al borrador. Falla si alguno dejó de estar VALIDO (otro usuario lo tomó). */
  async asignarABorrador(tx: Tx, tenantId: string, itemIds: string[], comprobanteId: string) {
    const { count } = await tx.itemFacturable.updateMany({
      where: { tenantId, id: { in: itemIds }, estado: 'VALIDO' },
      data: { estado: 'EN_BORRADOR', comprobanteId },
    });
    if (count !== itemIds.length) {
      throw new ConflictException('Algunos ítems ya no están disponibles (¿se generó otro borrador con ellos?). Recargá y volvé a intentar.');
    }
  }

  /** El borrador se elimina: sus ítems vuelven a estar disponibles. */
  async liberar(tx: Tx, tenantId: string, comprobanteId: string) {
    await tx.itemFacturable.updateMany({
      where: { tenantId, comprobanteId, estado: 'EN_BORRADOR' },
      data: { estado: 'VALIDO', comprobanteId: null },
    });
  }

  /** Referencias externas de los ítems de un comprobante (para que el integrador sepa qué se facturó). */
  async referenciasDeComprobante(tenantId: string, comprobanteId: string) {
    return this.prisma.itemFacturable.findMany({
      where: { tenantId, comprobanteId },
      select: { id: true, origen: true, referenciaExterna: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** El comprobante se emitió: sus ítems quedan facturados. */
  async marcarFacturados(tenantId: string, comprobanteId: string) {
    await this.prisma.itemFacturable.updateMany({
      where: { tenantId, comprobanteId, estado: 'EN_BORRADOR' },
      data: { estado: 'FACTURADO' },
    });
  }
}
