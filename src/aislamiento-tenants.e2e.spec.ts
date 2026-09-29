/**
 * Aislamiento entre tenants (ARCHITECTURE.md §9, punto 4): levanta la app completa y, con la
 * sesión (o la API key) de la empresa B, intenta leer, modificar y borrar recursos de la empresa A
 * en cada endpoint con id. Todo tiene que fallar y los datos de A no pueden cambiar.
 * Corre contra una base real (DATABASE_URL ya migrada); sin DATABASE_URL se saltea.
 */
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { randomUUID } from 'crypto';
import type { AddressInfo } from 'net';
import { AppModule } from './app.module';
import { hashPassword } from './modules/auth/password';
import { sha256Hex } from './modules/auth/claves';
import { PrismaService } from './shared/prisma/prisma.service';
import { cuitDePrueba } from './shared/testing/datos';

const PASSWORD = 'clave-de-prueba-e2e-1';

const hayBase = Boolean(process.env.DATABASE_URL);
(hayBase ? describe : describe.skip)('Aislamiento entre tenants (e2e)', () => {
  jest.setTimeout(120_000);
  let app: INestApplication;
  let base: string;
  const prisma = new PrismaService();
  const tenants: string[] = [];
  let tokenB: string;
  let keyB: string;
  const a: Record<string, string> = {};

  async function crearTenant(nombre: string) {
    const t = await prisma.tenant.create({
      data: {
        slug: `e2e-${nombre}-${randomUUID().slice(0, 8)}`,
        nombreFantasia: `E2E ${nombre}`,
        razonSocial: `E2E ${nombre} SA`,
        cuit: cuitDePrueba(),
        condicionIva: 'RESPONSABLE_INSCRIPTO',
        domicilioFiscal: 'Calle 1',
        inicioActividades: new Date('2020-01-01'),
      },
    });
    tenants.push(t.id);
    await prisma.usuario.create({ data: { tenantId: t.id, email: `usuario@${t.slug}.test`, passwordHash: await hashPassword(PASSWORD) } });
    return t;
  }

  async function http(metodo: string, ruta: string, opciones: { token?: string; key?: string; body?: unknown } = {}) {
    const res = await fetch(`${base}${ruta}`, {
      method: metodo,
      headers: {
        'Content-Type': 'application/json',
        ...(opciones.token ? { Authorization: `Bearer ${opciones.token}` } : {}),
        ...(opciones.key ? { 'X-Api-Key': opciones.key } : {}),
        ...(metodo === 'POST' ? { 'Idempotency-Key': `e2e-${randomUUID()}` } : {}),
      },
      body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
    });
    const texto = await res.text();
    return { status: res.status, body: texto };
  }

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api`;

    // Empresa A con un recurso de cada tipo.
    const ta = await crearTenant('a');
    const t = ta.id;
    a.cliente = (await prisma.cliente.create({ data: { tenantId: t, razonSocial: 'Cliente A', tipoDocumento: 'CUIT', numeroDocumento: '30668346908', condicionIva: 'RESPONSABLE_INSCRIPTO' } })).id;
    a.puntoVenta = (await prisma.puntoVenta.create({ data: { tenantId: t, numero: 7, ambiente: 'HOMOLOGACION' } })).id;
    a.comprobante = (
      await prisma.comprobante.create({
        data: { tenantId: t, tipo: 'FACTURA_A', ambiente: 'HOMOLOGACION', clienteId: a.cliente, puntoVentaId: a.puntoVenta, fechaEmision: new Date('2026-09-29'), concepto: 'PRODUCTOS', importeTotal: '100' },
      })
    ).id;
    a.importacion = (await prisma.importacion.create({ data: { tenantId: t, origen: 'MANUAL' } })).id;
    a.item = (
      await prisma.itemFacturable.create({
        data: {
          tenantId: t,
          importacionId: a.importacion,
          origen: 'MANUAL',
          referenciaExterna: 'ref-a',
          descripcion: 'Item A',
          cantidad: '1',
          unidad: 'UNIDAD',
          precioUnitario: '100',
          alicuotaIva: '21',
          hashContenido: 'h',
        },
      })
    ).id;
    a.tarifa = (
      await prisma.tarifa.create({
        data: { tenantId: t, clienteId: a.cliente, unidad: 'HORA', precioUnitario: '10', moneda: 'ARS', alicuotaIva: '21', vigenteDesde: new Date('2026-01-01') },
      })
    ).id;
    a.plantilla = (await prisma.plantillaMapeo.create({ data: { tenantId: t, nombre: 'P', formato: 'csv', config: {} } })).id;
    a.integracion = (await prisma.integracion.create({ data: { tenantId: t, nombre: 'I', keyPrefijo: `fct_${randomUUID().slice(0, 8)}`, keyHash: 'x', scopes: [] } })).id;
    a.webhook = (await prisma.webhookSuscripcion.create({ data: { tenantId: t, url: 'https://a.example.com/h', eventos: ['comprobante.emitido'], secretoCifrado: 'v1:x:x:x' } })).id;
    a.entrega = (await prisma.webhookEntrega.create({ data: { tenantId: t, suscripcionId: a.webhook, eventoId: 'evt_a', evento: 'comprobante.emitido', payload: {} } })).id;

    // Empresa B: sesión de usuario y API key con todos los permisos.
    const tb = await crearTenant('b');
    const login = await http('POST', '/auth/login', { body: { email: `usuario@${tb.slug}.test`, password: PASSWORD } });
    tokenB = (JSON.parse(login.body) as { accessToken: string }).accessToken;
    keyB = `fct_${randomUUID().replace(/-/g, '').slice(0, 8)}_${randomUUID().replace(/-/g, '')}`;
    await prisma.integracion.create({
      data: {
        tenantId: tb.id,
        nombre: 'B',
        keyPrefijo: keyB.slice(0, 12),
        keyHash: sha256Hex(keyB),
        scopes: ['items:write', 'comprobantes:write', 'comprobantes:read', 'acceso:emitir'],
      },
    });
  });

  afterAll(async () => {
    await app?.close();
    for (const id of tenants) {
      await prisma.webhookEntrega.deleteMany({ where: { tenantId: id } });
      await prisma.itemFacturable.deleteMany({ where: { tenantId: id } });
      await prisma.comprobante.deleteMany({ where: { tenantId: id } });
      await prisma.importacion.deleteMany({ where: { tenantId: id } });
      await prisma.tenant.delete({ where: { id } });
    }
    await prisma.$disconnect();
  });

  // [método, ruta, body] con la sesión de B sobre recursos de A.
  const conSesion = (): Array<[string, string, unknown?]> => [
    ['GET', `/clientes/${a.cliente}`],
    ['PATCH', `/clientes/${a.cliente}`, { razonSocial: 'Hackeado' }],
    ['GET', `/comprobantes/${a.comprobante}`],
    ['PATCH', `/comprobantes/${a.comprobante}`, { version: 0, observaciones: 'x' }],
    ['DELETE', `/comprobantes/${a.comprobante}`],
    ['POST', `/comprobantes/${a.comprobante}/emitir`, { version: 0 }],
    ['POST', `/comprobantes/${a.comprobante}/verificar`],
    ['POST', `/comprobantes/${a.comprobante}/notas`, { clase: 'NOTA_CREDITO', motivo: 'x' }],
    ['GET', `/comprobantes/${a.comprobante}/pdf`],
    ['POST', '/comprobantes/generar', { itemIds: [a.item] }],
    ['POST', '/comprobantes', { clienteId: a.cliente, puntoVentaId: a.puntoVenta, fechaEmision: '2026-09-29', concepto: 'PRODUCTOS', lineas: [{ descripcion: 'x', cantidad: '1', unidad: 'UNIDAD', precioUnitario: '1', alicuotaIva: '21' }] }],
    ['PATCH', `/configuracion/puntos-venta/${a.puntoVenta}`, { activo: false }],
    ['GET', `/importaciones/${a.importacion}`],
    ['POST', `/importaciones/${a.importacion}/confirmar`],
    ['POST', `/importaciones/${a.importacion}/descartar`],
    ['PATCH', `/importaciones/items/${a.item}`, { descripcion: 'Hackeado' }],
    ['POST', `/importaciones/items/${a.item}/descartar`],
    ['POST', `/importaciones/items/${a.item}/restaurar`],
    ['PATCH', `/configuracion/tarifas/${a.tarifa}`, { precioUnitario: '1' }],
    ['DELETE', `/configuracion/tarifas/${a.tarifa}`],
    ['POST', '/configuracion/tarifas', { clienteId: a.cliente, unidad: 'HORA', precioUnitario: '1', moneda: 'ARS', alicuotaIva: '21', vigenteDesde: '2026-01-01' }],
    ['PATCH', `/configuracion/plantillas-mapeo/${a.plantilla}`, { nombre: 'Hackeada' }],
    ['DELETE', `/integraciones/${a.integracion}`],
    ['PATCH', `/configuracion/webhooks/${a.webhook}`, { activa: false }],
    ['DELETE', `/configuracion/webhooks/${a.webhook}`],
    ['POST', `/configuracion/webhooks/${a.webhook}/rotar-secreto`],
    ['POST', `/configuracion/webhooks/${a.webhook}/probar`],
    ['POST', `/configuracion/webhooks/entregas/${a.entrega}/reenviar`],
  ];

  it('con la sesión de otra empresa, ningún endpoint con id toca recursos ajenos', async () => {
    const pasaron: string[] = [];
    for (const [metodo, ruta, body] of conSesion()) {
      const r = await http(metodo, ruta, { token: tokenB, body });
      if (r.status < 400) pasaron.push(`${metodo} ${ruta} → ${r.status}`);
    }
    expect(pasaron).toEqual([]);
  });

  it('con la API key de otra empresa, tampoco', async () => {
    const intentos: Array<[string, string, unknown?]> = [
      ['GET', `/v1/comprobantes/${a.comprobante}`],
      ['POST', `/v1/comprobantes/${a.comprobante}/emitir`, {}],
      ['GET', `/v1/comprobantes/${a.comprobante}/pdf`],
      ['GET', `/v1/importaciones/${a.importacion}`],
      ['POST', `/v1/importaciones/${a.importacion}/confirmar`],
      ['POST', '/v1/comprobantes/borradores', { itemIds: [a.item] }],
      ['POST', '/v1/comprobantes/borradores', { referencias: ['ref-a'] }],
    ];
    const pasaron: string[] = [];
    for (const [metodo, ruta, body] of intentos) {
      const r = await http(metodo, ruta, { key: keyB, body });
      if (r.status < 400) pasaron.push(`${metodo} ${ruta} → ${r.status}`);
    }
    expect(pasaron).toEqual([]);
  });

  it('los listados de B no muestran nada de A', async () => {
    const rutas = ['/clientes', '/comprobantes', '/importaciones', '/importaciones/items', '/configuracion/tarifas', '/configuracion/plantillas-mapeo', '/integraciones', '/configuracion/webhooks', '/configuracion/puntos-venta'];
    const idsA = Object.values(a);
    const filtrados: string[] = [];
    for (const ruta of rutas) {
      const r = await http('GET', ruta, { token: tokenB });
      expect(r.status).toBe(200);
      if (idsA.some((id) => r.body.includes(id))) filtrados.push(ruta);
    }
    const v1 = await http('GET', '/v1/items?referencia=ref-a', { key: keyB });
    if (v1.body.includes(a.item)) filtrados.push('/v1/items');
    expect(filtrados).toEqual([]);
  });

  it('los datos de A quedaron intactos', async () => {
    const [cliente, comprobante, item, tarifa, integracion, webhook, pv, imp] = await Promise.all([
      prisma.cliente.findUniqueOrThrow({ where: { id: a.cliente } }),
      prisma.comprobante.findUniqueOrThrow({ where: { id: a.comprobante } }),
      prisma.itemFacturable.findUniqueOrThrow({ where: { id: a.item } }),
      prisma.tarifa.findUniqueOrThrow({ where: { id: a.tarifa } }),
      prisma.integracion.findUniqueOrThrow({ where: { id: a.integracion } }),
      prisma.webhookSuscripcion.findUniqueOrThrow({ where: { id: a.webhook } }),
      prisma.puntoVenta.findUniqueOrThrow({ where: { id: a.puntoVenta } }),
      prisma.importacion.findUniqueOrThrow({ where: { id: a.importacion } }),
    ]);
    expect(cliente.razonSocial).toBe('Cliente A');
    expect(comprobante).toMatchObject({ estado: 'BORRADOR', version: 0, observaciones: null });
    expect(item).toMatchObject({ descripcion: 'Item A', estado: 'VALIDO' });
    expect(tarifa.precioUnitario.toString()).toBe('10');
    expect(integracion.revocadaEn).toBeNull();
    expect(webhook).toMatchObject({ activa: true, secretoCifrado: 'v1:x:x:x' });
    expect(pv.activo).toBe(true);
    expect(imp.estado).toBe('EN_STAGING');
    expect(await prisma.comprobante.count({ where: { tenantId: { in: tenants.slice(1) } } })).toBe(0);
  });
});
