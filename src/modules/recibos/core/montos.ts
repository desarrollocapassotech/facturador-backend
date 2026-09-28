// Montos en centavos enteros (bigint): el núcleo no depende de decimal.js.

const MONTO = /^\d{1,13}(\.\d{1,2})?$/;

/** "1234.5" → 123450n. Lanza si el formato no es un importe positivo con hasta 2 decimales. */
export function aCentavos(v: string): bigint {
  const t = v.trim();
  if (!MONTO.test(t)) throw new Error(`Importe inválido: "${v}". Usá números con punto decimal y hasta 2 decimales.`);
  const [ent, dec = ''] = t.split('.');
  return BigInt(ent) * 100n + BigInt(dec.padEnd(2, '0'));
}

/** 123450n → "1234.50" */
export function deCentavos(c: bigint): string {
  const s = c.toString().padStart(3, '0');
  return `${s.slice(0, -2)}.${s.slice(-2)}`;
}

/** 123450n → "1.234,50" */
export function formatearCentavos(c: bigint): string {
  const [ent, dec] = deCentavos(c).split('.');
  return `${ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec}`;
}
