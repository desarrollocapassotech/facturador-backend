import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { cifrar, descifrar } from '../../../../shared/crypto/cifrado';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { TrackerClient, TrackerError } from './tracker-client';
import type { ConexionTrackerDatos } from './tracker.types';

/** URL + API key del tracker por tenant. La key se guarda cifrada y nunca se devuelve. */
@Injectable()
export class ConexionTrackerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly client: TrackerClient,
  ) {}

  async obtenerPublica(tenantId: string) {
    const c = await this.prisma.conexionTracker.findUnique({ where: { tenantId } });
    return c
      ? { configurada: true, baseUrl: c.baseUrl, apiKeyPista: `…${c.apiKeyPista}`, ultimaPruebaEn: c.ultimaPruebaEn, ultimoError: c.ultimoError }
      : { configurada: false as const };
  }

  async guardar(tenantId: string, baseUrlCruda: string, apiKey?: string) {
    const baseUrl = normalizarUrl(baseUrlCruda);
    const actual = await this.prisma.conexionTracker.findUnique({ where: { tenantId } });
    if (!actual && !apiKey) throw new BadRequestException('Falta la clave de integración del tracker.');
    const datos = apiKey ? { apiKeyCifrada: cifrar(apiKey), apiKeyPista: apiKey.slice(-4) } : {};
    await this.prisma.conexionTracker.upsert({
      where: { tenantId },
      create: { tenantId, baseUrl, ...(datos as { apiKeyCifrada: string; apiKeyPista: string }), ultimoError: null },
      update: { baseUrl, ...datos, ultimoError: null, ultimaPruebaEn: null },
    });
    return this.obtenerPublica(tenantId);
  }

  async eliminar(tenantId: string) {
    await this.prisma.conexionTracker.deleteMany({ where: { tenantId } });
    return this.obtenerPublica(tenantId);
  }

  async datos(tenantId: string): Promise<ConexionTrackerDatos> {
    const c = await this.prisma.conexionTracker.findUnique({ where: { tenantId } });
    if (!c) throw new NotFoundException('El tracker no está configurado: cargá su URL y clave en Configuración → Tracker.');
    return { baseUrl: c.baseUrl, apiKey: descifrar(c.apiKeyCifrada) };
  }

  /** Pide las horas de hoy para comprobar URL y clave. */
  async probar(tenantId: string) {
    const conexion = await this.datos(tenantId);
    const hoy = new Date().toISOString().slice(0, 10);
    try {
      const registros = await this.client.obtenerHoras(conexion, hoy, hoy);
      await this.prisma.conexionTracker.update({ where: { tenantId }, data: { ultimaPruebaEn: new Date(), ultimoError: null } });
      return { ok: true, registrosHoy: registros.length };
    } catch (err) {
      const mensaje = err instanceof TrackerError ? err.message : 'Error inesperado al probar la conexión.';
      await this.prisma.conexionTracker.update({ where: { tenantId }, data: { ultimaPruebaEn: new Date(), ultimoError: mensaje } });
      return { ok: false, error: mensaje };
    }
  }
}

/** Solo http(s), sin credenciales ni query; sin barra final. En producción exige https salvo localhost. */
export function normalizarUrl(v: string): string {
  let u: URL;
  try {
    u = new URL(v.trim());
  } catch {
    throw new BadRequestException('La URL del tracker no es válida.');
  }
  const local = ['localhost', '127.0.0.1'].includes(u.hostname);
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && (local || process.env.NODE_ENV !== 'production'))) {
    throw new BadRequestException('La URL del tracker tiene que ser https.');
  }
  if (u.username || u.password || u.search || u.hash) throw new BadRequestException('La URL del tracker no puede tener usuario, parámetros ni #.');
  return `${u.origin}${u.pathname}`.replace(/\/+$/, '');
}
