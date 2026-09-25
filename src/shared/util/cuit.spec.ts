import { esCuitValido, normalizarCuit } from './cuit';

describe('cuit', () => {
  it('normaliza guiones y espacios', () => {
    expect(normalizarCuit('20-40937847-2')).toBe('20409378472');
    expect(normalizarCuit(' 30 66834690 8 ')).toBe('30668346908');
  });

  it.each(['20409378472', '30668346908', '20-40937847-2'])('acepta %s', (cuit) => {
    expect(esCuitValido(cuit)).toBe(true);
  });

  it.each([
    ['dígito verificador incorrecto', '20409378471'],
    ['largo incorrecto', '2040937847'],
    ['letras', '2040937847A'],
    ['vacío', ''],
  ])('rechaza %s', (_caso, cuit) => {
    expect(esCuitValido(cuit)).toBe(false);
  });
});
