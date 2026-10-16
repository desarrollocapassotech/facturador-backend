import { metadatosPublicos } from './representaciones';

describe('metadatosPublicos', () => {
  it('devuelve lo del integrador sin las claves internas del staging', () => {
    expect(
      metadatosPublicos({ proyectoId: 'p1', tipoCambio: 1540, precioDeTarifa: false, tarifaId: null, descripcionOriginal: 'x', valoresOriginales: {} }),
    ).toEqual({ proyectoId: 'p1', tipoCambio: 1540 });
  });

  it('sin metadatos (o con algo que no es un objeto) devuelve {}', () => {
    expect(metadatosPublicos(null)).toEqual({});
    expect(metadatosPublicos(['a'])).toEqual({});
  });
});
