// Portado de Vialto (arca.util.ts): ARCA opera en hora argentina y las fechas van como yyyymmdd.

/** Date (columna @db.Date, medianoche UTC) → "yyyymmdd". */
export function aYmdArca(fecha: Date): string {
  return fecha.toISOString().slice(0, 10).replace(/-/g, '');
}

/** "yyyymmdd" o "yyyy-mm-dd" → Date a medianoche UTC (como guarda Prisma un @db.Date). */
export function deYmdArca(ymd: string): Date {
  const d = ymd.replace(/\D/g, '');
  return new Date(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(4, 6)) - 1, Number(d.slice(6, 8))));
}

/** "yyyy-mm-dd" de hoy en Argentina. */
export function hoyArgentina(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(ahora);
}

/**
 * ARCA 10210: el comprobante asociado (la factura de una NC/ND) no puede tener fecha posterior
 * a la nota, salvo que sean del mismo mes (YYYYMM).
 */
export function fechaAsociadaValida(cbteFchYmd: string, asociadaYmd: string): boolean {
  return asociadaYmd <= cbteFchYmd || asociadaYmd.slice(0, 6) === cbteFchYmd.slice(0, 6);
}

/**
 * Fecha a informar a ARCA.
 * - Homologación: hoy (el mayor entre AR y UTC) y nunca anterior al último comprobante
 *   autorizado (evita el error 10016 en el entorno de pruebas, donde el CUIT es compartido).
 *   Por lo mismo, una factura de prueba puede quedar con fecha futura: si la nota no cumple
 *   la regla 10210, toma la fecha de la factura.
 * - Producción: la fecha de emisión elegida, sin pasar de hoy (la regla 10210 se valida antes
 *   de emitir, sin mover la fecha).
 */
export function resolverFechaCbte(
  ambiente: 'HOMOLOGACION' | 'PRODUCCION',
  fechaEmision: Date,
  ultimoCbteFechaYmd: string | null,
  ahora: Date = new Date(),
  asociadaFechaYmd: string | null = null,
): string {
  const hoyAr = hoyArgentina(ahora).replace(/-/g, '');
  if (ambiente === 'PRODUCCION') {
    const emision = aYmdArca(fechaEmision);
    return emision > hoyAr ? hoyAr : emision;
  }
  const hoyUtc = ahora.toISOString().slice(0, 10).replace(/-/g, '');
  let fecha = hoyAr > hoyUtc ? hoyAr : hoyUtc;
  if (ultimoCbteFechaYmd && /^\d{8}$/.test(ultimoCbteFechaYmd) && ultimoCbteFechaYmd > fecha) {
    fecha = ultimoCbteFechaYmd;
  }
  if (asociadaFechaYmd && !fechaAsociadaValida(fecha, asociadaFechaYmd)) {
    fecha = asociadaFechaYmd;
  }
  return fecha;
}

/** 00001-00000045 (punto de venta de 5 dígitos, como el encabezado del PDF y el frontend). */
export function formatearNumero(puntoVenta: number, numero: number): string {
  return `${String(puntoVenta).padStart(5, '0')}-${String(numero).padStart(8, '0')}`;
}
