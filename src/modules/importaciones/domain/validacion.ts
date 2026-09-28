import { createHash } from 'crypto';
import Decimal from 'decimal.js';
import { ALICUOTAS, UNIDADES_SERVICIO, type ItemFacturableInput } from './item-facturable';

export interface ErrorItem {
  campo: string;
  mensaje: string;
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const NUMERO = /^-?\d+(\.\d+)?$/;
const UNIDADES = ['HORA', 'UNIDAD', 'SERVICIO', 'MES'];

function fechaValida(v: string): boolean {
  if (!FECHA.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** "10.50" → "10.5"; null si no es un número. */
export function decimalCanonico(v: string | undefined | null): string | null {
  if (v === undefined || v === null) return null;
  const t = String(v).trim();
  if (!NUMERO.test(t)) return null;
  return new Decimal(t).toString();
}

/**
 * Reglas de validación del staging (ARCHITECTURE.md §6) que no necesitan base de datos.
 * `conPrecio=false` cuando el precio va a salir de una tarifa todavía no resuelta.
 */
export function validarItem(i: ItemFacturableInput, opciones: { exigirPrecio: boolean } = { exigirPrecio: true }): ErrorItem[] {
  const errores: ErrorItem[] = [];
  const err = (campo: string, mensaje: string) => errores.push({ campo, mensaje });

  if (!i.referenciaExterna?.trim()) err('referenciaExterna', 'Falta la referencia del ítem en el sistema de origen.');
  else if (i.referenciaExterna.length > 200) err('referenciaExterna', 'La referencia no puede superar 200 caracteres.');

  const c = i.cliente ?? {};
  if (!c.clienteId && !c.numeroDocumento && !c.referenciaExterna) err('cliente', 'Falta identificar al cliente.');

  if (!i.descripcion?.trim()) err('descripcion', 'Falta la descripción.');
  else if (i.descripcion.length > 500) err('descripcion', 'La descripción no puede superar 500 caracteres.');

  const cantidad = decimalCanonico(i.cantidad);
  if (cantidad === null) err('cantidad', 'La cantidad no es un número.');
  else if (new Decimal(cantidad).lte(0)) err('cantidad', 'La cantidad tiene que ser mayor a 0.');
  else if (new Decimal(cantidad).decimalPlaces() > 4) err('cantidad', 'La cantidad admite hasta 4 decimales.');

  if (!UNIDADES.includes(i.unidad)) err('unidad', 'La unidad tiene que ser HORA, UNIDAD, SERVICIO o MES.');

  if (i.precioUnitario !== undefined && i.precioUnitario !== null && String(i.precioUnitario).trim() !== '') {
    const precio = decimalCanonico(i.precioUnitario);
    if (precio === null) err('precioUnitario', 'El precio no es un número.');
    else if (new Decimal(precio).lt(0)) err('precioUnitario', 'El precio no puede ser negativo.');
    else if (new Decimal(precio).decimalPlaces() > 4) err('precioUnitario', 'El precio admite hasta 4 decimales.');
  } else if (opciones.exigirPrecio) {
    err('precioUnitario', 'Falta el precio.');
  }

  if (i.alicuotaIva !== undefined && i.alicuotaIva !== null && String(i.alicuotaIva).trim() !== '') {
    const a = decimalCanonico(i.alicuotaIva);
    if (a === null || !ALICUOTAS.includes(a)) err('alicuotaIva', 'La alícuota de IVA tiene que ser 0, 2.5, 5, 10.5, 21 o 27.');
  }

  if (i.moneda !== undefined && i.moneda !== 'ARS' && i.moneda !== 'USD') err('moneda', 'La moneda tiene que ser ARS o USD.');

  if (i.fecha !== undefined && !fechaValida(i.fecha)) err('fecha', 'La fecha tiene que tener formato YYYY-MM-DD.');
  if (i.periodo) {
    const okD = fechaValida(i.periodo.desde);
    const okH = fechaValida(i.periodo.hasta);
    if (!okD || !okH) err('periodo', 'El período tiene que tener fechas YYYY-MM-DD.');
    else if (i.periodo.desde > i.periodo.hasta) err('periodo', 'El período "desde" es posterior a "hasta".');
  }
  if (UNIDADES_SERVICIO.includes(i.unidad) && !i.periodo && !i.fecha) {
    err('periodo', 'Los servicios necesitan período o fecha (ARCA exige el período facturado).');
  }

  return errores;
}

/**
 * Hash del contenido facturable (sin metadatos): igual → reintento idempotente;
 * distinto → el origen corrigió el dato.
 */
export function hashContenido(i: ItemFacturableInput): string {
  const c = i.cliente ?? {};
  const canon = {
    cliente: {
      id: c.clienteId ?? null,
      doc: c.numeroDocumento ? `${c.tipoDocumento ?? ''}:${c.numeroDocumento.replace(/[-.\s]/g, '')}` : null,
      ref: c.referenciaExterna ?? null,
    },
    descripcion: i.descripcion?.trim() ?? '',
    cantidad: decimalCanonico(i.cantidad),
    unidad: i.unidad,
    precio: decimalCanonico(i.precioUnitario ?? null),
    moneda: i.moneda ?? null,
    alicuota: decimalCanonico(i.alicuotaIva ?? null),
    fecha: i.fecha ?? null,
    periodo: i.periodo ? [i.periodo.desde, i.periodo.hasta] : null,
  };
  return createHash('sha256').update(JSON.stringify(canon)).digest('hex');
}
