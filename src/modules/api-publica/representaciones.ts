import type {
  ClientePublicoDto,
  ComprobantePublicoDto,
  ImportacionPublicaDto,
  ItemPublicoDto,
} from './dto/api-publica.dto';

// Cómo se ven los recursos hacia afuera (API pública y webhooks): sin snapshots internos,
// logs de ARCA ni ids de usuarios. Montos como string decimal.

type Dec = { toString(): string };
const fecha = (d: Date | string | null | undefined): string | null => (d ? new Date(d).toISOString().slice(0, 10) : null);
const iso = (d: Date | string | null | undefined): string | null => (d ? new Date(d).toISOString() : null);

export interface ComprobanteInterno {
  id: string;
  tipo: string;
  estado: string;
  ambiente: string;
  version: number;
  numero: number | null;
  fechaEmision: Date;
  concepto: string;
  fechaServicioDesde: Date | null;
  fechaServicioHasta: Date | null;
  fechaVtoPago: Date | null;
  moneda: string;
  cotizacion: Dec;
  importeNetoGravado: Dec;
  importeIva: Dec;
  importeTributos: Dec;
  importeTotal: Dec;
  cae: string | null;
  caeVencimiento: Date | null;
  errorMensaje: string | null;
  errorDetalle: string | null;
  emitidoEn: Date | null;
  puntoVenta: { numero: number };
  cliente: { id: string; razonSocial: string; tipoDocumento: string; numeroDocumento: string; condicionIva: string };
  lineas: Array<{ descripcion: string; cantidad: Dec; unidad: string; precioUnitario: Dec; alicuotaIva: Dec; importeNeto: Dec; importeTotal: Dec }>;
  asociado: { id: string; tipo: string; numero: number | null } | null;
}

export function clientePublico(c: ComprobanteInterno['cliente']): ClientePublicoDto {
  return { id: c.id, razonSocial: c.razonSocial, tipoDocumento: c.tipoDocumento, numeroDocumento: c.numeroDocumento, condicionIva: c.condicionIva };
}

export function comprobantePublico(c: ComprobanteInterno): ComprobantePublicoDto {
  const desde = fecha(c.fechaServicioDesde);
  const hasta = fecha(c.fechaServicioHasta);
  return {
    id: c.id,
    tipo: c.tipo,
    estado: c.estado,
    ambiente: c.ambiente,
    version: c.version,
    puntoVenta: c.puntoVenta.numero,
    numero: c.numero,
    fechaEmision: fecha(c.fechaEmision) as string,
    concepto: c.concepto,
    periodo: desde && hasta ? { desde, hasta } : null,
    vencimientoPago: fecha(c.fechaVtoPago),
    moneda: c.moneda,
    cotizacion: c.cotizacion.toString(),
    importes: {
      netoGravado: c.importeNetoGravado.toString(),
      iva: c.importeIva.toString(),
      tributos: c.importeTributos.toString(),
      total: c.importeTotal.toString(),
    },
    cae: c.cae,
    caeVencimiento: fecha(c.caeVencimiento),
    cliente: clientePublico(c.cliente),
    lineas: c.lineas.map((l) => ({
      descripcion: l.descripcion,
      cantidad: l.cantidad.toString(),
      unidad: l.unidad,
      precioUnitario: l.precioUnitario.toString(),
      alicuotaIva: l.alicuotaIva.toString(),
      importeNeto: l.importeNeto.toString(),
      importeTotal: l.importeTotal.toString(),
    })),
    asociado: c.asociado ? { id: c.asociado.id, tipo: c.asociado.tipo, numero: c.asociado.numero } : null,
    error:
      c.errorMensaje && (c.estado === 'RECHAZADO' || c.estado === 'PENDIENTE_VERIFICACION')
        ? { mensaje: c.errorMensaje, detalle: c.errorDetalle }
        : null,
    emitidoEn: iso(c.emitidoEn),
  };
}

export interface ItemInterno {
  id: string;
  referenciaExterna: string;
  estado: string;
  errores: unknown;
  clienteId: string | null;
  descripcion: string;
  cantidad: Dec;
  unidad: string;
  precioUnitario: Dec;
  moneda: string;
  alicuotaIva: Dec;
  comprobanteId: string | null;
  importacionId: string | null;
}

export function itemPublico(i: ItemInterno): ItemPublicoDto {
  return {
    id: i.id,
    referenciaExterna: i.referenciaExterna,
    estado: i.estado,
    errores: Array.isArray(i.errores) ? (i.errores as ItemPublicoDto['errores']) : [],
    clienteId: i.clienteId,
    descripcion: i.descripcion,
    cantidad: i.cantidad.toString(),
    unidad: i.unidad,
    precioUnitario: i.precioUnitario.toString(),
    moneda: i.moneda,
    alicuotaIva: i.alicuotaIva.toString(),
    comprobanteId: i.comprobanteId,
    importacionId: i.importacionId,
  };
}

export interface ImportacionInterna {
  id: string;
  estado: string;
  origen: string;
  descripcion: string | null;
  totalItems: number;
  validos: number;
  conErrores: number;
  duplicados: number;
  actualizados: number;
  advertencias: unknown;
  createdAt: Date;
}

export function importacionPublica(i: ImportacionInterna): ImportacionPublicaDto {
  return {
    id: i.id,
    estado: i.estado,
    origen: i.origen,
    descripcion: i.descripcion,
    totalItems: i.totalItems,
    validos: i.validos,
    conErrores: i.conErrores,
    duplicados: i.duplicados,
    actualizados: i.actualizados,
    advertencias: Array.isArray(i.advertencias) ? (i.advertencias as ImportacionPublicaDto['advertencias']) : [],
    createdAt: i.createdAt.toISOString(),
  };
}
