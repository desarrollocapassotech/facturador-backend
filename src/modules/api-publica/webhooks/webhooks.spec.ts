import { createHmac } from 'crypto';
import { firmar, generarSecreto, MAX_INTENTOS, proximoIntento, verificarFirma } from './firma';
import { esIpPrivada, mensajeErrorConexion, validarUrlWebhook } from './url-webhook';

describe('firma de webhooks', () => {
  const secreto = 'whsec_prueba';
  const cuerpo = '{"id":"evt_1","evento":"comprobante.emitido"}';

  it('firma con HMAC-SHA256 sobre `t.cuerpo`', () => {
    const esperado = createHmac('sha256', secreto).update(`1700000000.${cuerpo}`).digest('hex');
    expect(firmar(secreto, cuerpo, 1700000000)).toBe(`t=1700000000,v1=${esperado}`);
  });

  it('verifica la firma y rechaza cuerpo alterado, otro secreto y firmas viejas', () => {
    const cabecera = firmar(secreto, cuerpo, 1700000000);
    expect(verificarFirma(secreto, cuerpo, cabecera, { ahora: 1700000100 })).toBe(true);
    expect(verificarFirma(secreto, cuerpo + ' ', cabecera, { ahora: 1700000100 })).toBe(false);
    expect(verificarFirma('otro', cuerpo, cabecera, { ahora: 1700000100 })).toBe(false);
    expect(verificarFirma(secreto, cuerpo, cabecera, { ahora: 1700001000 })).toBe(false);
    expect(verificarFirma(secreto, cuerpo, 'basura', { ahora: 1700000100 })).toBe(false);
  });

  it('genera secretos distintos con prefijo', () => {
    const a = generarSecreto();
    expect(a).toMatch(/^whsec_[A-Za-z0-9_-]{43}$/);
    expect(generarSecreto()).not.toBe(a);
  });

  it('backoff: 1 m, 5 m, 30 m, 2 h, 12 h y después se rinde', () => {
    const t0 = new Date('2026-09-29T12:00:00Z');
    const esperas = [1, 2, 3, 4, 5].map((n) => (proximoIntento(n, t0)!.getTime() - t0.getTime()) / 60_000);
    expect(esperas).toEqual([1, 5, 30, 120, 720]);
    expect(MAX_INTENTOS).toBe(6);
    expect(proximoIntento(6, t0)).toBeNull();
  });
});

describe('URL de webhook', () => {
  it('acepta https públicas y normaliza', () => {
    expect(validarUrlWebhook(' https://api.cliente.com/hooks/facturador?x=1 ', true)).toBe('https://api.cliente.com/hooks/facturador?x=1');
  });

  it('en desarrollo permite http y localhost', () => {
    expect(validarUrlWebhook('http://localhost:4010/hook', false)).toBe('http://localhost:4010/hook');
  });

  it.each([
    ['http://api.cliente.com/h', /https/],
    ['https://localhost/h', /interna/],
    ['https://10.0.0.5/h', /interna/],
    ['https://192.168.1.10/h', /interna/],
    ['https://169.254.169.254/latest/meta-data', /interna/],
    ['https://[::1]/h', /interna/],
    ['https://metadata.google.internal/', /interna/],
    ['https://user:pass@api.cliente.com/h', /usuario/],
    ['ftp://api.cliente.com', /http o https/],
    ['no es una url', /no es válida/],
  ])('en producción rechaza %s', (url, mensaje) => {
    expect(() => validarUrlWebhook(url, true)).toThrow(mensaje);
  });

  it('reconoce IPs privadas', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.0.1', '169.254.1.1', '100.64.0.1', '::1', 'fd00::1', '::ffff:10.0.0.1']) {
      expect(esIpPrivada(ip)).toBe(true);
    }
    for (const ip of ['8.8.8.8', '172.32.0.1', '200.45.1.1', '2800:3f0::1']) expect(esIpPrivada(ip)).toBe(false);
  });
});

describe('mensaje de error de conexión', () => {
  const fetchFallido = (code: string) => Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error(code), { code }) });

  it.each([
    ['ENOTFOUND', /dominio/],
    ['ECONNREFUSED', /rechazó/],
    ['CERT_HAS_EXPIRED', /certificado/],
    ['EHOSTUNREACH', /\(EHOSTUNREACH\)/],
  ])('traduce %s', (code, mensaje) => {
    expect(mensajeErrorConexion(fetchFallido(code))).toMatch(mensaje);
  });

  it('el error del lookup DNS (code directo) también', () => {
    expect(mensajeErrorConexion(Object.assign(new Error('getaddrinfo ENOTFOUND x'), { code: 'ENOTFOUND' }))).toMatch(/dominio/);
  });

  it('nunca deja el "fetch failed" pelado', () => {
    expect(mensajeErrorConexion(new TypeError('fetch failed'))).toBe('No se pudo conectar con el receptor.');
  });
});
