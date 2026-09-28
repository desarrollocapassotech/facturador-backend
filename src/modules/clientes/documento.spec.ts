import { normalizarDocumento } from './documento';

describe('normalizarDocumento', () => {
  it('CUIT con guiones válido', () => {
    expect(normalizarDocumento('CUIT', '30-66834690-8')).toEqual({ ok: true, numero: '30668346908' });
  });
  it('CUIT con dígito verificador incorrecto', () => {
    expect(normalizarDocumento('CUIT', '30668346907').ok).toBe(false);
  });
  it('DNI con puntos', () => {
    expect(normalizarDocumento('DNI', '12.345.678')).toEqual({ ok: true, numero: '12345678' });
  });
  it('DNI demasiado corto', () => {
    expect(normalizarDocumento('DNI', '12345').ok).toBe(false);
  });
  it('consumidor final siempre 0', () => {
    expect(normalizarDocumento('CONSUMIDOR_FINAL', 'lo que sea')).toEqual({ ok: true, numero: '0' });
  });
  it('pasaporte alfanumérico', () => {
    expect(normalizarDocumento('PASAPORTE', 'aa123456')).toEqual({ ok: true, numero: 'AA123456' });
  });
});
