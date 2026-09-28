import { sugerirLetra } from './letra-sugerida';

describe('sugerirLetra', () => {
  it.each([
    ['RESPONSABLE_INSCRIPTO', 'RESPONSABLE_INSCRIPTO', 'A'],
    ['RESPONSABLE_INSCRIPTO', 'MONOTRIBUTO', 'A'],
    ['RESPONSABLE_INSCRIPTO', 'MONOTRIBUTO_SOCIAL', 'A'],
    ['RESPONSABLE_INSCRIPTO', 'CONSUMIDOR_FINAL', 'B'],
    ['RESPONSABLE_INSCRIPTO', 'EXENTO', 'B'],
    ['RESPONSABLE_INSCRIPTO', 'CLIENTE_EXTERIOR', 'B'],
    ['MONOTRIBUTO', 'RESPONSABLE_INSCRIPTO', 'C'],
    ['MONOTRIBUTO', 'CONSUMIDOR_FINAL', 'C'],
    ['EXENTO', 'RESPONSABLE_INSCRIPTO', 'C'],
  ] as const)('emisor %s + receptor %s → %s', (emisor, receptor, letra) => {
    expect(sugerirLetra(emisor, receptor)).toBe(letra);
  });
});
