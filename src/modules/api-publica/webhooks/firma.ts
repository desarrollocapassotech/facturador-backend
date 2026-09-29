import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

// Webhooks salientes (ARCHITECTURE.md §8.5): firma HMAC-SHA256 y reintentos con backoff.

export const EVENTO_PRUEBA = 'webhook.prueba';

/** Esperas después de cada intento fallido: 1 m, 5 m, 30 m, 2 h, 12 h (6 intentos en total). */
export const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 12 * 3_600_000];
export const MAX_INTENTOS = BACKOFF_MS.length + 1;

export function generarSecreto(): string {
  return `whsec_${randomBytes(32).toString('base64url')}`;
}

/** `t=<unix>,v1=<hex>` con v1 = HMAC_SHA256(secreto, `${t}.${cuerpo}`). */
export function firmar(secreto: string, cuerpo: string, t: number = Math.floor(Date.now() / 1000)): string {
  const v1 = createHmac('sha256', secreto).update(`${t}.${cuerpo}`).digest('hex');
  return `t=${t},v1=${v1}`;
}

/**
 * Lo que tiene que hacer el receptor para validar un webhook (se documenta en Swagger):
 * recalcular la firma con el cuerpo crudo y rechazar firmas viejas (replay).
 */
export function verificarFirma(
  secreto: string,
  cuerpo: string,
  cabecera: string,
  opciones: { toleranciaSeg?: number; ahora?: number } = {},
): boolean {
  const partes = Object.fromEntries(cabecera.split(',').map((p) => p.trim().split('=', 2) as [string, string]));
  const t = Number(partes.t);
  if (!Number.isInteger(t) || !/^[0-9a-f]{64}$/.test(partes.v1 ?? '')) return false;
  const ahora = opciones.ahora ?? Math.floor(Date.now() / 1000);
  if (Math.abs(ahora - t) > (opciones.toleranciaSeg ?? 300)) return false;
  const esperado = Buffer.from(firmar(secreto, cuerpo, t).split('v1=')[1], 'hex');
  return timingSafeEqual(esperado, Buffer.from(partes.v1, 'hex'));
}

/** Cuándo reintentar después de `intentosHechos` fallidos; null si ya no hay más reintentos. */
export function proximoIntento(intentosHechos: number, ahora: Date = new Date()): Date | null {
  if (intentosHechos >= MAX_INTENTOS) return null;
  const espera = BACKOFF_MS[Math.max(0, intentosHechos - 1)];
  return new Date(ahora.getTime() + espera);
}
