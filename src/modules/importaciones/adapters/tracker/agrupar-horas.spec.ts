import { agruparHoras, condicionIvaDeTexto } from './agrupar-horas';
import type { ParametrosTracker, RegistroHorasTracker } from './tracker.types';

const cliente = { id: 'cli-1', name: 'Acme', razonSocial: 'Acme SA', cuit: '30-71234567-1', ivaCondition: 'Responsable Inscripto', billingCurrency: 'USD' };
const web = { id: 'p-web', name: 'Web', billingType: 'hourly' };
const soporte = { id: 'p-sop', name: 'Soporte', billingType: 'monthly' };

const r = (o: Partial<RegistroHorasTracker>): RegistroHorasTracker => ({
  id: Math.random().toString(36).slice(2),
  date: '2026-09-03',
  hours: '6',
  billableHours: '4.125',
  project: web,
  client: cliente,
  ...o,
});

const params = (o: Partial<ParametrosTracker> = {}): ParametrosTracker => ({
  desde: '2026-09-01',
  hasta: '2026-09-30',
  baseHoras: 'FACTURABLES',
  agrupacion: 'proyecto-mes',
  ...o,
});

describe('agruparHoras', () => {
  const registros = [
    r({ id: 'e1', date: '2026-09-03', hours: '6', billableHours: '4.125' }),
    r({ id: 'e2', date: '2026-09-10', hours: '2.5', billableHours: '1.5' }),
    r({ id: 'e3', date: '2026-09-11', hours: '3', billableHours: '0', project: soporte }),
    r({ id: 'e4', date: '2026-09-12', hours: '1', billableHours: '1', client: null }),
  ];

  it('agrupa por cliente, proyecto y mes, con horas facturables por defecto', () => {
    const { items } = agruparHoras(registros, params());
    const w = items.find((i) => i.referenciaExterna === 'tracker:cli-1:p-web:2026-09');
    expect(w).toMatchObject({
      origen: 'TRACKER',
      cantidad: '5.63', // 4.125 + 1.5 = 5.625 → 2 decimales
      unidad: 'HORA',
      descripcion: 'Web - Horas Septiembre 2026',
      periodo: { desde: '2026-09-01', hasta: '2026-09-30' },
      cliente: { referenciaExterna: 'cli-1', tipoDocumento: 'CUIT', numeroDocumento: '30712345671' },
    });
    expect(w?.precioUnitario).toBeUndefined(); // lo pone la tarifa del Facturador
    expect(w?.metadatos).toMatchObject({ horasTrabajadas: '8.5', horasFacturables: '5.625', registros: 2, idsRegistros: ['e1', 'e2'] });
  });

  it('con base TRABAJADAS usa las horas trabajadas', () => {
    const { items } = agruparHoras(registros, params({ baseHoras: 'TRABAJADAS' }));
    expect(items.find((i) => i.referenciaExterna.includes('p-web'))?.cantidad).toBe('8.5');
  });

  it('los proyectos mensuales van como 1 mes', () => {
    const { items } = agruparHoras(registros, params());
    expect(items.find((i) => i.referenciaExterna.includes('p-sop'))).toMatchObject({ cantidad: '1', unidad: 'MES', descripcion: 'Soporte - Abono Septiembre 2026' });
  });

  it('avisa por los registros sin cliente y por los grupos sin horas', () => {
    const { advertencias } = agruparHoras(
      [...registros, r({ id: 'e5', project: { id: 'p-x', name: 'Interno', billingType: null }, billableHours: '0' })],
      params(),
    );
    expect(advertencias.map((a) => a.mensaje).join(' | ')).toMatch(/1 registro\(s\) de proyectos sin cliente/);
    expect(advertencias.map((a) => a.mensaje).join(' | ')).toMatch(/Interno .*sin horas facturables/);
  });

  it('la referencia es estable entre corridas y un ítem por registro si se pide', () => {
    const a = agruparHoras(registros, params()).items.map((i) => i.referenciaExterna).sort();
    const b = agruparHoras([...registros].reverse(), params()).items.map((i) => i.referenciaExterna).sort();
    expect(a).toEqual(b);
    const porRegistro = agruparHoras(registros, params({ agrupacion: 'registro' })).items;
    expect(porRegistro.map((i) => i.referenciaExterna)).toEqual(expect.arrayContaining(['tracker:entry:e1', 'tracker:entry:e2']));
    expect(porRegistro.find((i) => i.referenciaExterna === 'tracker:entry:e1')?.periodo).toEqual({ desde: '2026-09-03', hasta: '2026-09-03' });
  });

  it('recorta el período al rango pedido y separa por mes', () => {
    const { items } = agruparHoras(
      [r({ id: 'a', date: '2026-08-20' }), r({ id: 'b', date: '2026-09-05' })],
      params({ desde: '2026-08-15', hasta: '2026-09-10' }),
    );
    expect(items.map((i) => i.periodo)).toEqual(
      expect.arrayContaining([
        { desde: '2026-08-15', hasta: '2026-08-31' },
        { desde: '2026-09-01', hasta: '2026-09-10' },
      ]),
    );
  });

  it('filtra por clientes del tracker', () => {
    const otro = { ...cliente, id: 'cli-2', name: 'Otro' };
    const { items } = agruparHoras([r({ client: otro }), r({})], params({ clienteExternoIds: ['cli-2'] }));
    expect(items).toHaveLength(1);
    expect(items[0].cliente.referenciaExterna).toBe('cli-2');
  });

  it('una razón social vacía o "-" usa el nombre del cliente', () => {
    const { items } = agruparHoras([r({ client: { ...cliente, razonSocial: ' - ' } })], params());
    expect(items[0].cliente.alta?.razonSocial).toBe('Acme');
  });

  it('suma registros con muchos decimales sin arrastrar redondeos', () => {
    // 3 registros de 0.488333… h (como los manda el tracker con 6 decimales): total 1.465 → 1.46 si
    // cada uno se hubiera redondeado a 4 decimales daba 1.4651 → 1.47.
    const { items } = agruparHoras(
      [r({ billableHours: '0.488333' }), r({ billableHours: '0.488333' }), r({ billableHours: '0.488333' })],
      params(),
    );
    expect(items[0].cantidad).toBe('1.46');
  });

  it('sin CUIT válido no manda documento, pero sí el alta sugerida', () => {
    const { items } = agruparHoras([r({ client: { ...cliente, cuit: '123', razonSocial: null } })], params());
    expect(items[0].cliente).toEqual({ referenciaExterna: 'cli-1', alta: { razonSocial: 'Acme', condicionIva: 'RESPONSABLE_INSCRIPTO' } });
  });
});

describe('condicionIvaDeTexto', () => {
  it.each([
    ['Responsable Inscripto', 'RESPONSABLE_INSCRIPTO'],
    ['RI', 'RESPONSABLE_INSCRIPTO'],
    ['Monotributista', 'MONOTRIBUTO'],
    ['Responsable Monotributo', 'MONOTRIBUTO'],
    ['Exento', 'EXENTO'],
    ['Consumidor final', 'CONSUMIDOR_FINAL'],
    ['Cliente del exterior', 'CLIENTE_EXTERIOR'],
    ['', undefined],
    ['otra cosa', undefined],
  ])('%s', (texto, esperado) => {
    expect(condicionIvaDeTexto(texto)).toBe(esperado);
  });
});
