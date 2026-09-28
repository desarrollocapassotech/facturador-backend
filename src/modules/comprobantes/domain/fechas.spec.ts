import { aYmdArca, deYmdArca, fechaAsociadaValida, formatearNumero, hoyArgentina, resolverFechaCbte } from './fechas';

describe('fechas ARCA', () => {
  it('convierte ida y vuelta', () => {
    expect(aYmdArca(deYmdArca('20260925'))).toBe('20260925');
    expect(aYmdArca(deYmdArca('2026-01-02'))).toBe('20260102');
  });

  it('hoy en Argentina a las 23:30 del 25 (02:30 UTC del 26) sigue siendo 25', () => {
    expect(hoyArgentina(new Date('2026-09-26T02:30:00Z'))).toBe('2026-09-25');
  });

  it('producción: usa la fecha de emisión, sin pasar de hoy', () => {
    const ahora = new Date('2026-09-25T15:00:00Z');
    expect(resolverFechaCbte('PRODUCCION', deYmdArca('20260920'), null, ahora)).toBe('20260920');
    expect(resolverFechaCbte('PRODUCCION', deYmdArca('20261001'), null, ahora)).toBe('20260925');
  });

  it('homologación: hoy, o la fecha del último comprobante si es posterior', () => {
    const ahora = new Date('2026-09-25T15:00:00Z');
    expect(resolverFechaCbte('HOMOLOGACION', deYmdArca('20260901'), null, ahora)).toBe('20260925');
    expect(resolverFechaCbte('HOMOLOGACION', deYmdArca('20260901'), '20260927', ahora)).toBe('20260927');
  });

  it('regla 10210: la factura asociada no puede ser posterior salvo en el mismo mes', () => {
    expect(fechaAsociadaValida('20260928', '20260915')).toBe(true);
    expect(fechaAsociadaValida('20260928', '20260930')).toBe(true); // posterior, mismo mes
    expect(fechaAsociadaValida('20260928', '20261006')).toBe(false); // posterior, otro mes
  });

  it('homologación: una nota toma la fecha de la factura si la de hoy viola la regla 10210', () => {
    const ahora = new Date('2026-09-28T15:00:00Z');
    expect(resolverFechaCbte('HOMOLOGACION', deYmdArca('20260928'), null, ahora, '20261006')).toBe('20261006');
    expect(resolverFechaCbte('HOMOLOGACION', deYmdArca('20260928'), null, ahora, '20260930')).toBe('20260928');
    expect(resolverFechaCbte('HOMOLOGACION', deYmdArca('20260928'), null, ahora, '20260901')).toBe('20260928');
  });

  it('formatea número de comprobante', () => {
    expect(formatearNumero(1, 45)).toBe('00001-00000045');
  });
});
