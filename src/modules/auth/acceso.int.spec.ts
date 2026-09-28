/**
 * Integración: API keys y token de acceso contra una base real (DATABASE_URL ya migrada).
 * Sin DATABASE_URL se saltea.
 */
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { cuitDePrueba } from '../../shared/testing/datos';
import { AccesoService } from './acceso.service';
import type { AuthContext } from './auth-context';
import { AuthService } from './auth.service';
import { IntegracionesService } from './integraciones.service';

const hayBase = Boolean(process.env.DATABASE_URL);
(hayBase ? describe : describe.skip)('Token de acceso (integración)', () => {
  jest.setTimeout(60_000);
  const prisma = new PrismaService();
  const jwt = new JwtService({ secret: 'secreto-de-test-con-mas-de-32-caracteres!!', signOptions: { algorithm: 'HS256', expiresIn: '1h' } });
  const config = { getOrThrow: () => 'http://front.test/,http://otro.test' } as unknown as ConfigService;
  const auth = new AuthService(prisma, jwt);
  const integraciones = new IntegracionesService(prisma);
  const acceso = new AccesoService(prisma, auth, config);
  const tenants: string[] = [];
  let a: AuthContext;
  let b: AuthContext;
  let claveA: string;

  async function tenant(nombre: string) {
    const t = await prisma.tenant.create({
      data: {
        slug: `test-acceso-${nombre}-${randomUUID().slice(0, 8)}`,
        nombreFantasia: `Test ${nombre}`,
        razonSocial: `Test ${nombre} SA`,
        cuit: cuitDePrueba(),
        condicionIva: 'RESPONSABLE_INSCRIPTO',
        domicilioFiscal: 'Calle 1',
      },
    });
    tenants.push(t.id);
    return t.id;
  }

  function token(url: string) {
    return new URL(url).searchParams.get('token') as string;
  }

  beforeAll(async () => {
    const ta = await tenant('a');
    const tb = await tenant('b');
    const creada = await integraciones.crear({ tenantId: ta, tipo: 'usuario', scopes: [] }, { nombre: 'Tracker', origen: 'TRACKER', scopes: ['acceso:emitir'] });
    claveA = creada.clave;
    a = await integraciones.validarApiKey(claveA);
    const cb = await integraciones.crear({ tenantId: tb, tipo: 'usuario', scopes: [] }, { nombre: 'Otro', origen: 'API', scopes: ['acceso:emitir'] });
    b = await integraciones.validarApiKey(cb.clave);
  });

  afterAll(async () => {
    for (const id of tenants) await prisma.tenant.delete({ where: { id } });
    await prisma.$disconnect();
  });

  it('la API key se guarda hasheada y valida el tenant correcto', async () => {
    const guardada = await prisma.integracion.findFirstOrThrow({ where: { tenantId: a.tenantId } });
    expect(guardada.keyHash).not.toContain(claveA);
    expect(claveA.startsWith(guardada.keyPrefijo)).toBe(true);
    expect(a).toMatchObject({ tipo: 'integracion', tenantId: a.tenantId, scopes: ['acceso:emitir'] });
    await expect(integraciones.validarApiKey(claveA.slice(0, -1) + (claveA.endsWith('a') ? 'b' : 'a'))).rejects.toThrow(UnauthorizedException);
  });

  it('crea el usuario sin contraseña, y el token se canjea una sola vez', async () => {
    const { url } = await acceso.emitirToken(a, { email: 'Ana@Tracker.test', nombre: 'Ana', destino: '/importaciones' });
    expect(url.startsWith('http://front.test/acceso?token=')).toBe(true);
    const usuario = await prisma.usuario.findUniqueOrThrow({ where: { tenantId_email: { tenantId: a.tenantId, email: 'ana@tracker.test' } } });
    expect(usuario.passwordHash).toBeNull();
    expect(usuario.creadoPor).toBe(`integracion:${a.integracionId}`);

    const t = token(url);
    const sesion = await acceso.canjear(t);
    expect(sesion.destino).toBe('/importaciones');
    expect(sesion.tenant.id).toBe(a.tenantId);
    await expect(auth.validarSesion(sesion.accessToken)).resolves.toMatchObject({ tenantId: a.tenantId, usuarioId: usuario.id });

    await expect(acceso.canjear(t)).rejects.toThrow(UnauthorizedException); // reusado
  });

  it('canjes en paralelo: solo uno gana', async () => {
    const t = token((await acceso.emitirToken(a, { email: 'paralelo@tracker.test' })).url);
    const resultados = await Promise.allSettled([acceso.canjear(t), acceso.canjear(t), acceso.canjear(t)]);
    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });

  it('rechaza un token expirado', async () => {
    const t = token((await acceso.emitirToken(a, { email: 'viejo@tracker.test' })).url);
    await prisma.tokenAcceso.updateMany({ where: { tenantId: a.tenantId, usadoEn: null }, data: { expiraEn: new Date(Date.now() - 1000) } });
    await expect(acceso.canjear(t)).rejects.toThrow(UnauthorizedException);
  });

  it('un token de otro tenant abre la sesión de ESE tenant, nunca la del primero', async () => {
    await acceso.emitirToken(a, { email: 'comun@test.test' });
    const t = token((await acceso.emitirToken(b, { email: 'comun@test.test' })).url);
    const sesion = await acceso.canjear(t);
    expect(sesion.tenant.id).toBe(b.tenantId);
    await expect(auth.validarSesion(sesion.accessToken)).resolves.toMatchObject({ tenantId: b.tenantId });
  });

  it('ignora un destino fuera de la lista blanca', async () => {
    const t = token((await acceso.emitirToken(a, { email: 'destino@tracker.test', destino: 'https://malo.com' })).url);
    expect((await acceso.canjear(t)).destino).toBeNull();
  });

  it('no da acceso a un usuario desactivado', async () => {
    await prisma.usuario.create({ data: { tenantId: a.tenantId, email: 'baja@tracker.test', activo: false } });
    await expect(acceso.emitirToken(a, { email: 'baja@tracker.test' })).rejects.toThrow(ForbiddenException);
  });

  it('revocar la integración invalida la key y los tokens pendientes', async () => {
    const t = token((await acceso.emitirToken(a, { email: 'pendiente@tracker.test' })).url);
    await integraciones.revocar(a.tenantId, a.integracionId as string);
    await expect(integraciones.validarApiKey(claveA)).rejects.toThrow(UnauthorizedException);
    await expect(acceso.canjear(t)).rejects.toThrow(UnauthorizedException);
  });
});
