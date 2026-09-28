import { aCentavos, deCentavos, formatearCentavos } from './montos';
import { centavosEnLetras } from './numero-a-letras';

describe('montos', () => {
  it('convierte a centavos sin errores de coma flotante', () => {
    expect(aCentavos('0.1') + aCentavos('0.2')).toBe(30n);
    expect(aCentavos('1234.5')).toBe(123450n);
    expect(aCentavos('7')).toBe(700n);
    expect(aCentavos(' 99.99 ')).toBe(9999n);
  });

  it('rechaza formatos inválidos', () => {
    for (const v of ['', '-1', '1,50', '1.234', '1e3', 'abc', '12345678901234']) {
      expect(() => aCentavos(v)).toThrow();
    }
  });

  it('formatea', () => {
    expect(deCentavos(5n)).toBe('0.05');
    expect(deCentavos(123450n)).toBe('1234.50');
    expect(formatearCentavos(123456789n)).toBe('1.234.567,89');
    expect(formatearCentavos(99n)).toBe('0,99');
  });

  it('importe en letras', () => {
    expect(centavosEnLetras(18150000n, 'ARS')).toBe('PESOS CIENTO OCHENTA Y UN MIL QUINIENTOS CON 00/100');
    expect(centavosEnLetras(150n, 'USD')).toBe('DÓLARES ESTADOUNIDENSES UN CON 50/100');
    expect(centavosEnLetras(100000000n, 'ARS')).toBe('PESOS UN MILLÓN CON 00/100');
  });
});
