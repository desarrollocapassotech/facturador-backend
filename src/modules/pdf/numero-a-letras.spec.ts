import { importeEnLetras } from './numero-a-letras';

describe('importeEnLetras', () => {
  it.each([
    ['0', 'PESOS CERO'],
    ['1', 'PESOS UN'],
    ['21.5', 'PESOS VEINTIUN CON CINCUENTA CENTAVOS'],
    ['100', 'PESOS CIEN'],
    ['1234.56', 'PESOS MIL DOSCIENTOS TREINTA Y CUATRO CON CINCUENTA Y SEIS CENTAVOS'],
    ['12100', 'PESOS DOCE MIL CIEN'],
    ['107800', 'PESOS CIENTO SIETE MIL OCHOCIENTOS'],
    ['1000000', 'PESOS UN MILLÓN'],
    ['2500000.1', 'PESOS DOS MILLONES QUINIENTOS MIL CON DIEZ CENTAVOS'],
    ['3.01', 'PESOS TRES CON UN CENTAVO'],
    ['3.21', 'PESOS TRES CON VEINTIUN CENTAVOS'],
    ['1500000000', 'PESOS MIL QUINIENTOS MILLONES'],
  ])('%s', (importe, esperado) => {
    expect(importeEnLetras(importe, 'ARS')).toBe(esperado);
  });

  it('dólares', () => {
    expect(importeEnLetras('10', 'USD')).toBe('DÓLARES ESTADOUNIDENSES DIEZ');
    expect(importeEnLetras('10.75', 'USD')).toBe('DÓLARES ESTADOUNIDENSES DIEZ CON SETENTA Y CINCO CENTAVOS');
  });
});
