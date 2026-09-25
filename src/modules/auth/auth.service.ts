import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../shared/prisma/prisma.service';
import type { AuthContext, SesionJwtPayload } from './auth-context';
import { LoginDto } from './dto/login.dto';
import { hashPassword, normalizarEmail, verificarPassword } from './password';

const CREDENCIALES_INVALIDAS = 'Email o contraseña incorrectos.';

export interface SesionResponse {
  accessToken: string;
  usuario: { id: string; email: string; nombre: string | null };
  tenant: { id: string; slug: string; nombre: string };
}

@Injectable()
export class AuthService {
  /** Hash de relleno: se compara igual cuando no hay usuarios, para no filtrar por tiempo qué emails existen. */
  private hashRelleno?: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(dto: LoginDto): Promise<SesionResponse> {
    const email = normalizarEmail(dto.email);

    const candidatos = await this.prisma.usuario.findMany({
      where: {
        email,
        activo: true,
        passwordHash: { not: null },
        tenant: { activo: true, ...(dto.tenantSlug ? { slug: dto.tenantSlug } : {}) },
      },
      include: { tenant: { select: { id: true, slug: true, nombreFantasia: true } } },
    });

    if (candidatos.length === 0) {
      this.hashRelleno ??= hashPassword('relleno-que-nunca-coincide');
      await verificarPassword(dto.password, await this.hashRelleno);
      throw new UnauthorizedException(CREDENCIALES_INVALIDAS);
    }

    const coincidencias: typeof candidatos = [];
    for (const u of candidatos) {
      if (await verificarPassword(dto.password, u.passwordHash as string)) {
        coincidencias.push(u);
      }
    }

    if (coincidencias.length === 0) {
      throw new UnauthorizedException(CREDENCIALES_INVALIDAS);
    }

    if (coincidencias.length > 1) {
      throw new ConflictException({
        message: 'Tu email tiene cuenta en más de una empresa. Elegí con cuál ingresar.',
        tenants: coincidencias.map((u) => ({ slug: u.tenant.slug, nombre: u.tenant.nombreFantasia })),
      });
    }

    const usuario = coincidencias[0];
    await this.prisma.usuario.update({
      where: { id: usuario.id },
      data: { ultimoAcceso: new Date() },
    });

    const payload: SesionJwtPayload = { sub: usuario.id, tid: usuario.tenantId, tv: usuario.tokenVersion };
    return {
      accessToken: await this.jwt.signAsync(payload),
      usuario: { id: usuario.id, email: usuario.email, nombre: usuario.nombre },
      tenant: { id: usuario.tenant.id, slug: usuario.tenant.slug, nombre: usuario.tenant.nombreFantasia },
    };
  }

  /**
   * Valida un JWT de sesión y devuelve el AuthContext.
   * Revisa en DB que el usuario y el tenant sigan activos y que la sesión no haya sido revocada.
   */
  async validarSesion(token: string): Promise<AuthContext> {
    let payload: SesionJwtPayload;
    try {
      payload = await this.jwt.verifyAsync<SesionJwtPayload>(token, { algorithms: ['HS256'] });
    } catch {
      throw new UnauthorizedException('La sesión expiró o no es válida.');
    }

    const usuario = await this.prisma.usuario.findUnique({
      where: { tenantId_id: { tenantId: payload.tid, id: payload.sub } },
      select: { id: true, activo: true, tokenVersion: true, tenant: { select: { activo: true } } },
    });

    if (!usuario || !usuario.activo || !usuario.tenant.activo || usuario.tokenVersion !== payload.tv) {
      throw new UnauthorizedException('La sesión expiró o no es válida.');
    }

    return { tenantId: payload.tid, tipo: 'usuario', usuarioId: usuario.id, scopes: [] };
  }

  async perfil(auth: AuthContext) {
    const usuario = await this.prisma.usuario.findUniqueOrThrow({
      where: { tenantId_id: { tenantId: auth.tenantId, id: auth.usuarioId as string } },
      select: {
        id: true,
        email: true,
        nombre: true,
        tenant: { select: { id: true, slug: true, nombreFantasia: true, ambienteArca: true } },
      },
    });
    return {
      usuario: { id: usuario.id, email: usuario.email, nombre: usuario.nombre },
      tenant: {
        id: usuario.tenant.id,
        slug: usuario.tenant.slug,
        nombre: usuario.tenant.nombreFantasia,
        ambienteArca: usuario.tenant.ambienteArca,
      },
    };
  }
}
