import { cifrar, descifrar } from './cifrado';

describe('cifrado', () => {
  const original = process.env.FAKTIA_ENCRYPTION_KEY;
  const originalVieja = process.env.FACTURADOR_ENCRYPTION_KEY;
  beforeEach(() => {
    process.env.FAKTIA_ENCRYPTION_KEY = 'clave-de-test-con-mas-de-32-caracteres!!';
    delete process.env.FACTURADOR_ENCRYPTION_KEY;
  });
  afterAll(() => {
    process.env.FAKTIA_ENCRYPTION_KEY = original;
    process.env.FACTURADOR_ENCRYPTION_KEY = originalVieja;
    if (original === undefined) delete process.env.FAKTIA_ENCRYPTION_KEY;
    if (originalVieja === undefined) delete process.env.FACTURADOR_ENCRYPTION_KEY;
  });

  it('ida y vuelta, con IV distinto en cada cifrado', () => {
    const pem = '-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----\n';
    const a = cifrar(pem);
    const b = cifrar(pem);
    expect(a).not.toBe(b);
    expect(a.startsWith('v1:')).toBe(true);
    expect(descifrar(a)).toBe(pem);
  });

  it('falla si cambia la clave', () => {
    const c = cifrar('secreto');
    process.env.FAKTIA_ENCRYPTION_KEY = 'otra-clave-distinta-de-mas-de-32-caracteres';
    expect(() => descifrar(c)).toThrow('No se pudo descifrar');
  });

  it('falla si el dato fue alterado', () => {
    const c = cifrar('secreto');
    const alterado = c.slice(0, -2) + (c.endsWith('00') ? '11' : '00');
    expect(() => descifrar(alterado)).toThrow();
  });

  it('sigue leyendo el nombre viejo de la variable (FACTURADOR_ENCRYPTION_KEY)', () => {
    const c = cifrar('secreto');
    process.env.FACTURADOR_ENCRYPTION_KEY = process.env.FAKTIA_ENCRYPTION_KEY;
    delete process.env.FAKTIA_ENCRYPTION_KEY;
    expect(descifrar(c)).toBe('secreto');
  });
});
