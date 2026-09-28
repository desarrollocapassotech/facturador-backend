import {
  destinoSeguro,
  generarApiKey,
  generarTokenAcceso,
  hashesIguales,
  prefijoDeApiKey,
  sha256Hex,
  tokenAccesoConFormato,
} from './claves';

describe('claves', () => {
  it('genera API keys con prefijo público y hash de la clave completa', () => {
    const { clave, prefijo, hash } = generarApiKey();
    expect(clave).toMatch(/^fct_[A-Za-z0-9]{8}_[A-Za-z0-9]{32}$/);
    expect(clave.startsWith(`${prefijo}_`)).toBe(true);
    expect(hash).toBe(sha256Hex(clave));
    expect(prefijoDeApiKey(clave)).toBe(prefijo);
    expect(generarApiKey().clave).not.toBe(clave);
  });

  it('rechaza claves mal formadas', () => {
    for (const c of ['', 'fct_abc', 'xyz_12345678_' + 'a'.repeat(32), 'fct_12345678_' + 'a'.repeat(31), 'fct_1234567!_' + 'a'.repeat(32)]) {
      expect(prefijoDeApiKey(c)).toBeNull();
    }
  });

  it('compara hashes en tiempo constante y sin aceptar vacíos', () => {
    const h = sha256Hex('x');
    expect(hashesIguales(h, sha256Hex('x'))).toBe(true);
    expect(hashesIguales(h, sha256Hex('y'))).toBe(false);
    expect(hashesIguales(h, 'abcd')).toBe(false);
    expect(hashesIguales('', '')).toBe(false);
  });

  it('genera tokens de acceso de 32 bytes', () => {
    const { token, hash } = generarTokenAcceso();
    expect(tokenAccesoConFormato(token)).toBe(true);
    expect(hash).toBe(sha256Hex(token));
    expect(tokenAccesoConFormato('corto')).toBe(false);
  });

  it.each([
    ['/importaciones', '/importaciones'],
    ['/importaciones/ckx123', '/importaciones/ckx123'],
    ['/comprobantes/abc?tab=pdf', '/comprobantes/abc?tab=pdf'],
    ['/configuracion', '/configuracion'],
  ])('acepta el destino %s', (d, esperado) => {
    expect(destinoSeguro(d)).toBe(esperado);
  });

  it.each(['https://malo.com', '//malo.com', '/\\malo.com', '/login', '/importacionesX', 'importaciones', '/importaciones//x', '/comprobantes?next=https://x', '/a b', undefined, ''])(
    'rechaza el destino %s',
    (d) => {
      expect(destinoSeguro(d)).toBeNull();
    },
  );
});
