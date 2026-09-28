import { Injectable, Logger } from '@nestjs/common';
import type { ConexionTrackerDatos, RegistroHorasTracker, RespuestaHorasTracker } from './tracker.types';

export class TrackerError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

/** Cliente HTTP de GET /integrations/billable-hours del tracker (ARCHITECTURE.md §7.3). */
@Injectable()
export class TrackerClient {
  private readonly logger = new Logger(TrackerClient.name);

  async obtenerHoras(conexion: ConexionTrackerDatos, desde: string, hasta: string): Promise<RegistroHorasTracker[]> {
    const url = `${conexion.baseUrl}/integrations/billable-hours?from=${encodeURIComponent(desde)}&to=${encodeURIComponent(hasta)}`;
    let res: Response;
    try {
      res = await fetch(url, { headers: { 'X-Integration-Key': conexion.apiKey, Accept: 'application/json' }, signal: AbortSignal.timeout(30_000) });
    } catch (err) {
      // Nunca se loguea la key ni la URL con parámetros sensibles (no los hay, pero por las dudas solo el host).
      this.logger.warn(`No se pudo conectar con el tracker (${new URL(conexion.baseUrl).host}): ${(err as Error).message}`);
      throw new TrackerError('No se pudo conectar con el tracker. Revisá la URL en Configuración → Tracker.');
    }
    const body = (await res.json().catch(() => null)) as (RespuestaHorasTracker & { message?: unknown }) | null;
    if (res.status === 401 || res.status === 403) throw new TrackerError('El tracker rechazó la clave de integración.', res.status);
    if (res.status === 404) throw new TrackerError('El tracker no tiene el endpoint de horas facturables (¿versión vieja?).', 404);
    if (!res.ok) {
      const msg = typeof body?.message === 'string' ? `: ${body.message}` : '';
      throw new TrackerError(`El tracker respondió ${res.status}${msg}`, res.status);
    }
    if (!body || !Array.isArray(body.entries)) throw new TrackerError('El tracker devolvió una respuesta inesperada.');
    return body.entries.filter(esRegistroValido);
  }
}

function esRegistroValido(e: unknown): e is RegistroHorasTracker {
  const r = e as RegistroHorasTracker;
  return (
    !!r &&
    typeof r.id === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(r.date) &&
    /^\d+(\.\d+)?$/.test(String(r.hours)) &&
    /^\d+(\.\d+)?$/.test(String(r.billableHours)) &&
    !!r.project &&
    typeof r.project.id === 'string'
  );
}
