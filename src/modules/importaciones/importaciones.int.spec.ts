/**
 * Integración del flujo importación → staging → borrador → emisión contra una base real
 * (DATABASE_URL ya migrada). Sin DATABASE_URL se saltea. ARCA y el tracker son falsos.
 */
import { ConflictException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { cuitDePrueba } from '../../shared/testing/datos';
import type { ArcaGateway, CredencialesArca, SolicitudCae } from '../arca';
import type { AuthContext } from '../auth';
import { ClientesService } from '../clientes';
import { ComprobantesService } from '../comprobantes/comprobantes.service';
import { EmisionService } from '../comprobantes/emision.service';
import { TarifasService, TenantsService, type CredencialesArcaProvider } from '../tenants';
import { ExcelCsvAdapter } from './adapters/excel/excel.adapter';
import { PlantillasMapeoService } from './adapters/excel/plantillas-mapeo.service';
import type { ConexionTrackerService } from './adapters/tracker/conexion-tracker.service';
import { TrackerAdapter } from './adapters/tracker/tracker.adapter';
import type { TrackerClient } from './adapters/tracker/tracker-client';
import type { RegistroHorasTracker } from './adapters/tracker/tracker.types';
import { ImportacionesService } from './importaciones.service';
import { ItemsFacturablesService } from './items-facturables.service';
import { StagingService } from './staging.service';

class ArcaOk implements ArcaGateway {
  n = 0;
  async ultimoAutorizado() {
    return this.n;
  }
  async autorizar(_c: CredencialesArca, s: SolicitudCae) {
    this.n = s.cbteNro;
    return { cae: `7${String(s.cbteNro).padStart(13, '0')}`, caeVto: '20261231', observaciones: [] };
  }
  async consultar() {
    return null;
  }
  async cotizacionDolar() {
    return '1000';
  }
  async consultarPadron() {
    return null;
  }
}

const hayBase = Boolean(process.env.DATABASE_URL);
(hayBase ? describe : describe.skip)('Importaciones (integración)', () => {
  jest.setTimeout(90_000);
  const prisma = new PrismaService();
  let auth: AuthContext;
  let tenantId: string;
  let acmeId: string;
  let registros: RegistroHorasTracker[];
  let importaciones: ImportacionesService;
  let comprobantes: ComprobantesService;
  let emision: EmisionService;
  let tarifas: TarifasService;

  const cred = {
    obtener: async (): Promise<CredencialesArca> => ({ tenantId, ambiente: 'HOMOLOGACION', cuit: '20409378472', certPem: null, keyPem: null, usaCuitPrueba: true }),
  } as unknown as CredencialesArcaProvider;

  const entrada = (o: Partial<RegistroHorasTracker>): RegistroHorasTracker => ({
    id: randomUUID(),
    date: '2026-09-10',
    hours: '5',
    billableHours: '4',
    project: { id: 'p-web', name: 'Web', billingType: 'hourly' },
    client: { id: 'trk-acme', name: 'Acme', razonSocial: 'Acme SA', cuit: '30668346908', ivaCondition: 'Responsable Inscripto' },
    ...o,
  });

  beforeAll(async () => {
    const t = await prisma.tenant.create({
      data: {
        slug: `test-import-${randomUUID().slice(0, 8)}`,
        nombreFantasia: 'Test import',
        razonSocial: 'Test Import SA',
        cuit: cuitDePrueba(),
        condicionIva: 'RESPONSABLE_INSCRIPTO',
        domicilioFiscal: 'Calle 1',
        inicioActividades: new Date('2020-01-01'),
      },
    });
    tenantId = t.id;
    auth = { tenantId, tipo: 'usuario', scopes: [] };
    await prisma.puntoVenta.create({ data: { tenantId, numero: 1, ambiente: 'HOMOLOGACION' } });
    acmeId = (
      await prisma.cliente.create({
        data: { tenantId, razonSocial: 'Acme SA', tipoDocumento: 'CUIT', numeroDocumento: '30668346908', condicionIva: 'RESPONSABLE_INSCRIPTO', diasVencimiento: 15 },
      })
    ).id;

    const arca = new ArcaOk();
    const tenants = new TenantsService(prisma);
    tarifas = new TarifasService(prisma);
    const clientes = new ClientesService(prisma, cred, arca);
    const items = new ItemsFacturablesService(prisma);
    const staging = new StagingService(prisma, clientes, tarifas);
    registros = [];
    const client = { obtenerHoras: async () => registros } as unknown as TrackerClient;
    const conexiones = { datos: async () => ({ baseUrl: 'http://tracker.test', apiKey: 'k' }) } as unknown as ConexionTrackerService;
    const plantillas = new PlantillasMapeoService(prisma);
    importaciones = new ImportacionesService(prisma, staging, new TrackerAdapter(conexiones, client), new ExcelCsvAdapter(), plantillas);
    comprobantes = new ComprobantesService(prisma, clientes, tenants, items);
    emision = new EmisionService(prisma, comprobantes, tenants, cred, arca, items);
  });

  afterAll(async () => {
    if (tenantId) {
      await prisma.arcaLog.deleteMany({ where: { tenantId } });
      await prisma.comprobanteLinea.deleteMany({ where: { tenantId } });
      await prisma.itemFacturable.deleteMany({ where: { tenantId } });
      await prisma.comprobante.deleteMany({ where: { tenantId } });
      await prisma.importacion.deleteMany({ where: { tenantId } });
      await prisma.tenant.delete({ where: { id: tenantId } });
    }
    await prisma.$disconnect();
  });

  const params = { desde: '2026-09-01', hasta: '2026-09-30', baseHoras: 'FACTURABLES' as const, agrupacion: 'proyecto-mes' as const };
  const itemsDe = async (importacionId: string) => (await importaciones.items(tenantId, { importacionId })).items;

  it('tracker sin tarifa: el ítem queda con error; con la tarifa, se recalcula el precio', async () => {
    registros = [entrada({ billableHours: '4' }), entrada({ date: '2026-09-11', billableHours: '2.5' })];
    const imp = await importaciones.importarTracker(auth, params);
    const [item] = await itemsDe(imp.id);
    expect(item.clienteId).toBe(acmeId); // por CUIT
    expect(item.estado).toBe('CON_ERRORES');
    expect(JSON.stringify(item.errores)).toMatch(/No hay tarifa por hora vigente/);
    // Se vinculó el cliente externo para las próximas veces.
    expect(await prisma.clienteReferenciaExterna.count({ where: { tenantId, referenciaExterna: 'trk-acme' } })).toBe(1);

    await tarifas.crear(tenantId, {
      clienteId: acmeId,
      claveExterna: 'p-web',
      descripcion: 'Desarrollo {proyecto} - {periodo}',
      unidad: 'HORA',
      precioUnitario: '50',
      moneda: 'USD',
      alicuotaIva: '21',
      vigenteDesde: '2026-01-01',
    });
    const revalidado = await importaciones.editarItem(tenantId, item.id, {});
    expect(revalidado).toMatchObject({ estado: 'VALIDO', moneda: 'USD', descripcion: 'Desarrollo Web - Septiembre 2026' });
    expect(revalidado.precioUnitario.toString()).toBe('50');
    expect(revalidado.cantidad.toString()).toBe('6.5');
  });

  it('reimportar el mismo mes no duplica; si cambian las horas, actualiza', async () => {
    const otra = await importaciones.importarTracker(auth, params);
    expect(otra).toMatchObject({ duplicados: 1, actualizados: 0 });
    registros = [...registros, entrada({ date: '2026-09-12', billableHours: '1' })];
    const tercera = await importaciones.importarTracker(auth, params);
    expect(tercera).toMatchObject({ actualizados: 1, validos: 1 });
    const [item] = await itemsDe(tercera.id);
    expect(item.cantidad.toString()).toBe('7.5');
    expect(await prisma.itemFacturable.count({ where: { tenantId, origen: 'TRACKER' } })).toBe(1);
  });

  it('cambiar la base de horas recalcula la cantidad sin volver al tracker', async () => {
    const [item] = await prisma.itemFacturable.findMany({ where: { tenantId, origen: 'TRACKER' } });
    const trabajadas = await importaciones.editarItem(tenantId, item.id, { baseHoras: 'TRABAJADAS' });
    expect(trabajadas.cantidad.toString()).toBe('15');
    const facturables = await importaciones.editarItem(tenantId, item.id, { baseHoras: 'FACTURABLES' });
    expect(facturables.cantidad.toString()).toBe('7.5');
  });

  it('asignar un cliente resuelve también los otros ítems del mismo cliente externo', async () => {
    registros = [
      entrada({ project: { id: 'p-a', name: 'A', billingType: 'hourly' }, client: { id: 'trk-nuevo', name: 'Nuevo' } }),
      entrada({ project: { id: 'p-b', name: 'B', billingType: 'hourly' }, client: { id: 'trk-nuevo', name: 'Nuevo' } }),
    ];
    const imp = await importaciones.importarTracker(auth, params);
    const items = await itemsDe(imp.id);
    expect(items.every((i) => i.estado === 'CON_ERRORES' && !i.clienteId)).toBe(true);
    const r = await importaciones.editarItem(tenantId, items[0].id, { clienteId: acmeId });
    expect(r.actualizadosConElMismoCliente).toBe(1);
    expect((await itemsDe(imp.id)).every((i) => i.clienteId === acmeId)).toBe(true);
    await importaciones.descartar(tenantId, imp.id);
  });

  it('solo se generan borradores de importaciones confirmadas; eliminar el borrador libera los ítems', async () => {
    const imp = (await prisma.importacion.findMany({ where: { tenantId, origen: 'TRACKER' }, orderBy: { createdAt: 'asc' } }))[2];
    await expect(comprobantes.generarDesdeItems(auth, { importacionId: imp.id })).rejects.toThrow(/confirmaste la importación/);
    await importaciones.confirmar(tenantId, imp.id);

    const r = await comprobantes.generarDesdeItems(auth, { importacionId: imp.id });
    expect(r.creados).toBe(1);
    const borrador = await comprobantes.obtener(tenantId, r.comprobantes[0].id);
    expect(borrador).toMatchObject({ tipo: 'FACTURA_A', moneda: 'USD', concepto: 'SERVICIOS' });
    expect(borrador.fechaServicioDesde?.toISOString().slice(0, 10)).toBe('2026-09-01');
    expect(borrador.importeTotal.toString()).toBe('453.75'); // 7.5 × 50 × 1.21
    expect(borrador.lineas[0].itemFacturableId).toBeTruthy();
    const [item] = await prisma.itemFacturable.findMany({ where: { tenantId, origen: 'TRACKER', importacionId: imp.id } });
    expect(item).toMatchObject({ estado: 'EN_BORRADOR', comprobanteId: borrador.id });

    // El mismo ítem no puede ir a dos borradores.
    await expect(comprobantes.generarDesdeItems(auth, { itemIds: [item.id] })).rejects.toThrow(ConflictException);

    // Editar el borrador sin tocar líneas conserva el vínculo.
    const editado = await comprobantes.actualizarBorrador(auth, borrador.id, { version: borrador.version, observaciones: 'x' });
    expect(editado.lineas[0].itemFacturableId).toBe(item.id);

    await comprobantes.eliminar(tenantId, borrador.id);
    expect(await prisma.itemFacturable.findUniqueOrThrow({ where: { id: item.id } })).toMatchObject({ estado: 'VALIDO', comprobanteId: null });
  });

  it('emitir el borrador marca los ítems como facturados; reimportar distinto avisa', async () => {
    const [item] = await prisma.itemFacturable.findMany({ where: { tenantId, origen: 'TRACKER', estado: 'VALIDO' } });
    const r = await comprobantes.generarDesdeItems(auth, { itemIds: [item.id] });
    const b = await comprobantes.obtener(tenantId, r.comprobantes[0].id);
    const emitido = await emision.emitir(auth, b.id, b.version, randomUUID());
    expect(emitido.estado).toBe('EMITIDO');
    expect((await prisma.itemFacturable.findUniqueOrThrow({ where: { id: item.id } })).estado).toBe('FACTURADO');

    registros = [...registros.filter((e) => e.client?.id === 'trk-acme'), entrada({ date: '2026-09-20', billableHours: '3' })];
    const imp = await importaciones.importarTracker(auth, params);
    expect(JSON.stringify(imp.advertencias)).toMatch(/Ya fue facturado/);
    expect((await prisma.itemFacturable.findUniqueOrThrow({ where: { id: item.id } })).estado).toBe('FACTURADO');
  });

  it('Excel: plantilla, ítems con precio propio y agrupación por cliente', async () => {
    const plantilla = await new PlantillasMapeoService(prisma).crear(tenantId, {
      nombre: 'Horas',
      formato: 'csv',
      config: {
        filaEncabezado: 1,
        columnas: [
          { campo: 'cliente.numeroDocumento', encabezado: 'CUIT', tipo: 'texto' },
          { campo: 'descripcion', encabezado: 'Concepto', tipo: 'texto' },
          { campo: 'cantidad', encabezado: 'Cantidad', tipo: 'decimal', separadorDecimal: ',' },
          { campo: 'precioUnitario', encabezado: 'Precio', tipo: 'decimal', separadorDecimal: ',' },
          { campo: 'fecha', encabezado: 'Fecha', tipo: 'fecha' },
        ],
        valoresPorDefecto: { unidad: 'UNIDAD', alicuotaIva: '21', moneda: 'ARS' },
      },
    });
    const csv = 'CUIT;Concepto;Cantidad;Precio;Fecha\n30668346908;Licencia;2;1.000,50;05/09/2026\n30668346908;Soporte;1;500;06/09/2026\n20000000001;Otro;1;1;06/09/2026\n';
    const imp = await importaciones.importarExcel(auth, { buffer: Buffer.from(csv), nombre: 'ventas.csv' }, plantilla.id);
    expect(imp).toMatchObject({ totalItems: 3, validos: 2, conErrores: 1 });
    const repetido = await importaciones.importarExcel(auth, { buffer: Buffer.from(csv), nombre: 'ventas.csv' }, plantilla.id);
    expect(repetido.duplicados).toBe(3);
    expect(JSON.stringify(repetido.advertencias)).toMatch(/ya se importó/);

    await importaciones.confirmar(tenantId, imp.id);
    const r = await comprobantes.generarDesdeItems(auth, { importacionId: imp.id });
    expect(r).toMatchObject({ creados: 1, items: 2 });
    const b = await comprobantes.obtener(tenantId, r.comprobantes[0].id);
    expect(b).toMatchObject({ concepto: 'PRODUCTOS', moneda: 'ARS' });
    expect(b.importeTotal.toString()).toBe('3026.21'); // (2 × 1000.50 + 500) × 1.21
  });
});
