import { cifrar, descifrar } from './cifrado';

describe('cifrado', () => {
  const original = process.env.FACTURADOR_ENCRYPTION_KEY;
  beforeEach(() => {
    process.env.FACTURADOR_ENCRYPTION_KEY = 'clave-de-test-con-mas-de-32-caracteres!!';
  });
  afterAll(() => {
    process.env.FACTURADOR_ENCRYPTION_KEY = original;
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
    process.env.FACTURADOR_ENCRYPTION_KEY = 'otra-clave-distinta-de-mas-de-32-caracteres';
    expect(() => descifrar(c)).toThrow('No se pudo descifrar');
  });

  it('falla si el dato fue alterado', () => {
    const c = cifrar('secreto');
    const alterado = c.slice(0, -2) + (c.endsWith('00') ? '11' : '00');
    expect(() => descifrar(alterado)).toThrow();
  });
});
