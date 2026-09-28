import { importeEnLetras } from './numero-a-letras';

describe('importeEnLetras', () => {
  it.each([
    ['0', 'PESOS CERO CON 00/100'],
    ['1', 'PESOS UN CON 00/100'],
    ['21.5', 'PESOS VEINTIUN CON 50/100'],
    ['100', 'PESOS CIEN CON 00/100'],
    ['1234.56', 'PESOS MIL DOSCIENTOS TREINTA Y CUATRO CON 56/100'],
    ['12100', 'PESOS DOCE MIL CIEN CON 00/100'],
    ['1000000', 'PESOS UN MILLÓN CON 00/100'],
    ['2500000.1', 'PESOS DOS MILLONES QUINIENTOS MIL CON 10/100'],
    ['1500000000', 'PESOS MIL QUINIENTOS MILLONES CON 00/100'],
  ])('%s', (importe, esperado) => {
    expect(importeEnLetras(importe, 'ARS')).toBe(esperado);
  });

  it('dólares', () => {
    expect(importeEnLetras('10', 'USD')).toBe('DÓLARES ESTADOUNIDENSES DIEZ CON 00/100');
  });
});
