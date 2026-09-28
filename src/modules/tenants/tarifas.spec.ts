import { descripcionDeTarifa, elegirTarifa, type TarifaCandidata } from './tarifas';

const base: TarifaCandidata = {
  id: 'base',
  origen: null,
  claveExterna: null,
  descripcion: null,
  unidad: 'HORA',
  precioUnitario: '100',
  moneda: 'USD',
  alicuotaIva: '21',
  vigenteDesde: '2026-01-01',
  vigenteHasta: null,
};
const t = (o: Partial<TarifaCandidata>): TarifaCandidata => ({ ...base, ...o });

describe('elegirTarifa', () => {
  it('prefiere la del proyecto, después la del origen, después la general', () => {
    const tarifas = [t({ id: 'general' }), t({ id: 'tracker', origen: 'TRACKER' }), t({ id: 'proyecto', claveExterna: 'p1' })];
    expect(elegirTarifa(tarifas, { fecha: '2026-09-01', origen: 'TRACKER', claveExterna: 'p1' })?.id).toBe('proyecto');
    expect(elegirTarifa(tarifas, { fecha: '2026-09-01', origen: 'TRACKER', claveExterna: 'otro' })?.id).toBe('tracker');
    expect(elegirTarifa(tarifas, { fecha: '2026-09-01', origen: 'EXCEL' })?.id).toBe('general');
  });

  it('proyecto + origen le gana a solo proyecto', () => {
    const tarifas = [t({ id: 'p', claveExterna: 'p1' }), t({ id: 'p+o', claveExterna: 'p1', origen: 'TRACKER' })];
    expect(elegirTarifa(tarifas, { fecha: '2026-09-01', origen: 'TRACKER', claveExterna: 'p1' })?.id).toBe('p+o');
  });

  it('respeta la vigencia y, a igual especificidad, toma la más reciente', () => {
    const tarifas = [
      t({ id: 'vieja', vigenteDesde: '2026-01-01', vigenteHasta: '2026-06-30' }),
      t({ id: 'nueva', vigenteDesde: '2026-07-01' }),
      t({ id: 'futura', vigenteDesde: '2027-01-01' }),
    ];
    expect(elegirTarifa(tarifas, { fecha: '2026-03-15' })?.id).toBe('vieja');
    expect(elegirTarifa(tarifas, { fecha: '2026-07-01' })?.id).toBe('nueva');
    expect(elegirTarifa(tarifas, { fecha: '2026-06-30' })?.id).toBe('vieja');
    expect(elegirTarifa(tarifas, { fecha: '2025-12-31' })).toBeNull();
  });

  it('una tarifa de otro origen o de otro proyecto no aplica', () => {
    const tarifas = [t({ id: 'excel', origen: 'EXCEL' }), t({ id: 'p2', claveExterna: 'p2' })];
    expect(elegirTarifa(tarifas, { fecha: '2026-09-01', origen: 'TRACKER', claveExterna: 'p1' })).toBeNull();
  });

  it('filtra por unidad si se pide', () => {
    const tarifas = [t({ id: 'hora' }), t({ id: 'mes', unidad: 'MES' })];
    expect(elegirTarifa(tarifas, { fecha: '2026-09-01', unidad: 'MES' })?.id).toBe('mes');
  });
});

describe('descripcionDeTarifa', () => {
  it('reemplaza variables', () => {
    expect(descripcionDeTarifa('Desarrollo {proyecto} - {periodo}', { proyecto: 'Web', periodo: 'Septiembre 2026' })).toBe(
      'Desarrollo Web - Septiembre 2026',
    );
    expect(descripcionDeTarifa('Horas {otra} {proyecto}', { proyecto: 'App' })).toBe('Horas App');
  });
});
