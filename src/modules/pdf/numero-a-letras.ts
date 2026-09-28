// Portado de Vialto (factura-pdf.service.ts#numeroALetras), con moneda y soporte hasta miles de millones.

const UNIDADES = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE', 'DIEZ', 'ONCE',
  'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
const VEINTES = ['VEINTE', 'VEINTIUN', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISÉIS',
  'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE'];
const DECENAS = ['', 'DIEZ', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const CENTENAS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS',
  'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

function dosDigitos(n: number): string {
  if (n < 20) return UNIDADES[n];
  const d = Math.floor(n / 10);
  const u = n % 10;
  if (d === 2) return VEINTES[u];
  return u === 0 ? DECENAS[d] : `${DECENAS[d]} Y ${UNIDADES[u]}`;
}

function tresDigitos(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'CIEN';
  const c = Math.floor(n / 100);
  return [CENTENAS[c], dosDigitos(n % 100)].filter(Boolean).join(' ');
}

function entero(n: number): string {
  if (n === 0) return 'CERO';
  const milesDeMillones = Math.floor(n / 1_000_000_000);
  const millones = Math.floor((n % 1_000_000_000) / 1_000_000);
  const miles = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;
  const partes: string[] = [];
  if (milesDeMillones > 0) {
    partes.push(milesDeMillones === 1 ? 'MIL' : `${tresDigitos(milesDeMillones)} MIL`);
    if (millones === 0) partes.push('MILLONES');
  }
  if (millones > 0) partes.push(millones === 1 && milesDeMillones === 0 ? 'UN MILLÓN' : `${tresDigitos(millones)} MILLONES`);
  if (miles > 0) partes.push(miles === 1 ? 'MIL' : `${tresDigitos(miles)} MIL`);
  if (resto > 0) partes.push(tresDigitos(resto));
  return partes.join(' ');
}

/** 1234.5 → "PESOS UN MIL DOSCIENTOS TREINTA Y CUATRO CON 50/100" (formato usual en comprobantes). */
export function importeEnLetras(importe: string | number, moneda: 'ARS' | 'USD'): string {
  const [ent, dec = '0'] = Number(importe).toFixed(2).split('.');
  const nombre = moneda === 'USD' ? 'DÓLARES ESTADOUNIDENSES' : 'PESOS';
  return `${nombre} ${entero(Number(ent))} CON ${dec.padEnd(2, '0')}/100`;
}
