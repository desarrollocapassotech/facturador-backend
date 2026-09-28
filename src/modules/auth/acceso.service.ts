import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../shared/prisma/prisma.service';
import type { AuthContext } from './auth-context';
import { AuthService, type SesionResponse } from './auth.service';
import { destinoSeguro, generarTokenAcceso, sha256Hex, tokenAccesoConFormato } from './claves';
import { normalizarEmail } from './password';

export const VIGENCIA_TOKEN_MS = 60_000;
const TOKEN_INVALIDO = 'El enlace de acceso expiró o ya se usó. Volvé a entrar desde el otro sistema.';

/**
 * Acceso sin doble login (ARCHITECTURE.md §8.1): un sistema integrado (con su API key)
 * pide un token de un solo uso para un email; el navegador lo canjea por una sesión.
 */
@Injectable()
export class AccesoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  async emitirToken(integracion: AuthContext, datos: { email: string; nombre?: string; destino?: string }) {
    const email = normalizarEmail(datos.email);
    const nombre = datos.nombre?.trim() || null;
    // Si el usuario no existe en el tenant, se crea sin contraseña (solo entra por este camino).
    const usuario = await this.prisma.usuario.upsert({
      where: { tenantId_email: { tenantId: integracion.tenantId, email } },
      create: { tenantId: integracion.tenantId, email, nombre, creadoPor: `integracion:${integracion.integracionId}` },
      update: {},
      select: { id: true, activo: true },
    });
    if (!usuario.activo) throw new ForbiddenException('El usuario está desactivado en el Facturador.');

    const { token, hash } = generarTokenAcceso();
    const destino = destinoSeguro(datos.destino);
    const expiraEn = new Date(Date.now() + VIGENCIA_TOKEN_MS);
    await this.prisma.tokenAcceso.create({
      data: {
        tenantId: integracion.tenantId,
        integracionId: integracion.integracionId as string,
        usuarioId: usuario.id,
        tokenHash: hash,
        destino,
        expiraEn,
      },
    });

    const front = (this.config.getOrThrow<string>('FRONTEND_URL').split(',')[0] ?? '').trim().replace(/\/+$/, '');
    return { url: `${front}/acceso?token=${token}`, expiraEn: expiraEn.toISOString() };
  }

  /** Canje atómico: un token solo se puede usar una vez y dentro de su vigencia. */
  async canjear(token: string): Promise<SesionResponse & { destino: string | null }> {
    if (!tokenAccesoConFormato(token)) throw new UnauthorizedException(TOKEN_INVALIDO);
    const hash = sha256Hex(token);
    const { count } = await this.prisma.tokenAcceso.updateMany({
      where: { tokenHash: hash, usadoEn: null, expiraEn: { gt: new Date() } },
      data: { usadoEn: new Date() },
    });
    if (!count) throw new UnauthorizedException(TOKEN_INVALIDO);

    const t = await this.prisma.tokenAcceso.findUniqueOrThrow({
      where: { tokenHash: hash },
      select: { usuarioId: true, tenantId: true, destino: true, integracion: { select: { revocadaEn: true } } },
    });
    if (t.integracion.revocadaEn) throw new UnauthorizedException(TOKEN_INVALIDO);
    const sesion = await this.auth.sesionPara(t.tenantId, t.usuarioId);
    return { ...sesion, destino: t.destino };
  }
}
