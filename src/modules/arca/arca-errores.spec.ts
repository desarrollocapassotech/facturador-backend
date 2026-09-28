import { mapearError } from './arca-errores';
import { ArcaError } from './arca.types';

function errorSdk(status: number | undefined, data: unknown, message = 'Request failed') {
  return Object.assign(new Error(message), { status, data });
}

describe('mapearError', () => {
  it('error de ARCA con código (AfipWebServiceError) → RECHAZO con código', () => {
    const err = Object.assign(new Error('(10016) El numero o fecha del comprobante no se corresponde'), {
      code: 10016,
    });
    const r = mapearError(err, true);
    expect(r).toBeInstanceOf(ArcaError);
    expect(r.tipo).toBe('RECHAZO');
    expect(r.codigoArca).toBe(10016);
    expect(r.message).toContain('Volvé a emitir');
  });

  it('timeout sin status después de enviar → INCIERTO', () => {
    const err = Object.assign(new Error('timeout of 30000ms exceeded'), { code: 'ECONNABORTED' });
    expect(mapearError(err, true).tipo).toBe('INCIERTO');
  });

  it('timeout antes de enviar (consultas) → RECHAZO, se puede reintentar', () => {
    const err = Object.assign(new Error('timeout of 30000ms exceeded'), { code: 'ECONNABORTED' });
    expect(mapearError(err, false).tipo).toBe('RECHAZO');
  });

  it('HTTP 5xx de AfipSDK al autorizar → INCIERTO', () => {
    expect(mapearError(errorSdk(502, 'Bad Gateway'), true).tipo).toBe('INCIERTO');
  });

  it('HTTP 401 → CONFIGURACION', () => {
    expect(mapearError(errorSdk(401, { message: 'Unauthorized' }), true).tipo).toBe('CONFIGURACION');
  });

  it('HTTP 400 por certificado → CONFIGURACION con el detalle', () => {
    const r = mapearError(errorSdk(400, { message: 'cms.sign.invalid: cert and key mismatch' }), false);
    expect(r.tipo).toBe('CONFIGURACION');
    expect(r.message).toContain('no son pareja');
  });

  it('HTTP 400 de validación → RECHAZO con el mensaje de AfipSDK', () => {
    const r = mapearError(errorSdk(400, { message: 'ImpTotal es requerido' }), true);
    expect(r.tipo).toBe('RECHAZO');
    expect(r.message).toContain('ImpTotal es requerido');
  });
});
