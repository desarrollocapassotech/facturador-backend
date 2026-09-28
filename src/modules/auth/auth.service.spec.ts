import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { PrismaService } from '../../shared/prisma/prisma.service';
import { AuthService } from './auth.service';
import { hashPassword } from './password';

const SECRET = 'secreto-de-test-con-mas-de-32-caracteres!!';

type UsuarioFake = {
  id: string;
  tenantId: string;
  email: string;
  nombre: string | null;
  passwordHash: string | null;
  tokenVersion: number;
  activo: boolean;
  tenant: { id: string; slug: string; nombreFantasia: string; activo: boolean };
};

function crearPrismaFake(usuarios: UsuarioFake[]) {
  return {
    usuario: {
      findMany: jest.fn(async ({ where }) =>
        usuarios.filter(
          (u) =>
            u.email === where.email &&
            u.activo &&
            u.passwordHash !== null &&
            u.tenant.activo &&
            (!where.tenant.slug || u.tenant.slug === where.tenant.slug),
        ),
      ),
      update: jest.fn(async () => ({})),
      findUnique: jest.fn(async ({ where }) => {
        const u = usuarios.find(
          (x) => x.id === where.tenantId_id.id && x.tenantId === where.tenantId_id.tenantId,
        );
        return u ?? null;
      }),
    },
  } as unknown as PrismaService;
}

describe('AuthService', () => {
  let hash: string;
  const jwt = new JwtService({ secret: SECRET, signOptions: { algorithm: 'HS256', expiresIn: '1h' } });

  beforeAll(async () => {
    hash = await hashPassword('clave-correcta-123');
  });

  const usuario = (over: Partial<UsuarioFake> = {}): UsuarioFake => ({
    id: 'u1',
    tenantId: 't1',
    email: 'ana@empresa.com',
    nombre: 'Ana',
    passwordHash: hash,
    tokenVersion: 0,
    activo: true,
    tenant: { id: 't1', slug: 'empresa-uno', nombreFantasia: 'Empresa Uno', activo: true },
    ...over,
  });

  it('devuelve un JWT válido con credenciales correctas (email en mayúsculas incluido)', async () => {
    const service = new AuthService(crearPrismaFake([usuario()]), jwt);
    const res = await service.login({ email: ' ANA@Empresa.com ', password: 'clave-correcta-123' });

    expect(res.tenant.slug).toBe('empresa-uno');
    const payload = await jwt.verifyAsync(res.accessToken);
    expect(payload).toMatchObject({ sub: 'u1', tid: 't1', tv: 0 });
  });

  it('rechaza contraseña incorrecta y email inexistente con el mismo mensaje', async () => {
    const service = new AuthService(crearPrismaFake([usuario()]), jwt);

    const mal = service.login({ email: 'ana@empresa.com', password: 'otra-clave-123' });
    const inexistente = service.login({ email: 'nadie@empresa.com', password: 'clave-correcta-123' });

    await expect(mal).rejects.toThrow(UnauthorizedException);
    await expect(inexistente).rejects.toThrow(UnauthorizedException);
    await expect(mal).rejects.toThrow('Email o contraseña incorrectos.');
    await expect(inexistente).rejects.toThrow('Email o contraseña incorrectos.');
  });

  it('no deja entrar con contraseña a un usuario sin passwordHash (creado por integración)', async () => {
    const service = new AuthService(crearPrismaFake([usuario({ passwordHash: null })]), jwt);
    await expect(
      service.login({ email: 'ana@empresa.com', password: 'clave-correcta-123' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('pide elegir empresa cuando el email tiene cuenta con la misma contraseña en dos tenants', async () => {
    const otro = usuario({
      id: 'u2',
      tenantId: 't2',
      tenant: { id: 't2', slug: 'empresa-dos', nombreFantasia: 'Empresa Dos', activo: true },
    });
    const service = new AuthService(crearPrismaFake([usuario(), otro]), jwt);

    await expect(
      service.login({ email: 'ana@empresa.com', password: 'clave-correcta-123' }),
    ).rejects.toThrow(ConflictException);

    const res = await service.login({
      email: 'ana@empresa.com',
      password: 'clave-correcta-123',
      tenantSlug: 'empresa-dos',
    });
    expect(res.tenant.slug).toBe('empresa-dos');
  });

  describe('validarSesion', () => {
    it('arma el AuthContext para un token vigente', async () => {
      const service = new AuthService(crearPrismaFake([usuario()]), jwt);
      const token = await jwt.signAsync({ sub: 'u1', tid: 't1', tv: 0 });
      await expect(service.validarSesion(token)).resolves.toEqual({
        tenantId: 't1',
        tipo: 'usuario',
        usuarioId: 'u1',
        scopes: [],
      });
    });

    it('rechaza un token revocado (tokenVersion distinto)', async () => {
      const service = new AuthService(crearPrismaFake([usuario({ tokenVersion: 1 })]), jwt);
      const token = await jwt.signAsync({ sub: 'u1', tid: 't1', tv: 0 });
      await expect(service.validarSesion(token)).rejects.toThrow(UnauthorizedException);
    });

    it('rechaza si el tenant fue desactivado', async () => {
      const u = usuario();
      u.tenant.activo = false;
      const service = new AuthService(crearPrismaFake([u]), jwt);
      const token = await jwt.signAsync({ sub: 'u1', tid: 't1', tv: 0 });
      await expect(service.validarSesion(token)).rejects.toThrow(UnauthorizedException);
    });

    it('rechaza un token de otro tenant aunque el usuario exista', async () => {
      const service = new AuthService(crearPrismaFake([usuario()]), jwt);
      const token = await jwt.signAsync({ sub: 'u1', tid: 'otro-tenant', tv: 0 });
      await expect(service.validarSesion(token)).rejects.toThrow(UnauthorizedException);
    });

    it('rechaza un token firmado con otro secreto', async () => {
      const service = new AuthService(crearPrismaFake([usuario()]), jwt);
      const falso = await new JwtService({ secret: 'otro-secreto-de-mas-de-32-caracteres!!' }).signAsync({
        sub: 'u1',
        tid: 't1',
        tv: 0,
      });
      await expect(service.validarSesion(falso)).rejects.toThrow(UnauthorizedException);
    });
  });
});
