import { ArcaError } from './arca.types';

// Adaptado de Vialto (liquidaciones-arca/arca-error.util.ts y ArcaClientService#mapError).

type Obj = Record<string, unknown>;

function asArray<T>(v: T | T[] | null | undefined): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

/** Mensajes de transporte sin información de negocio. */
function esRuido(msg: string): boolean {
  const t = msg.trim();
  return (
    !t ||
    /^http\s*\d{3}$/i.test(t) ||
    /^request failed with status code\s*\d+$/i.test(t) ||
    /^network error$/i.test(t)
  );
}

/** Busca texto útil en las formas de error que devuelve AfipSDK / axios. */
export function extraerDetalle(payload: unknown, depth = 0): string | null {
  if (payload == null || depth > 4) return null;
  if (typeof payload === 'string') {
    const t = payload.trim();
    if (esRuido(t)) return null;
    if (t.startsWith('{') || t.startsWith('[')) {
      try {
        return extraerDetalle(JSON.parse(t), depth + 1);
      } catch {
        return t;
      }
    }
    return t;
  }
  if (typeof payload !== 'object') return null;
  const o = payload as Obj;

  const errs = asArray((o.Errors as Obj | undefined)?.Err as Obj | Obj[] | undefined);
  const msgs = errs.map((e) => String(e.Msg ?? '').trim()).filter(Boolean);
  if (msgs.length) return `[${String(errs[0].Code ?? '')}] ${msgs.join(' ')}`;

  for (const k of ['message', 'error', 'msg', 'detail', 'title']) {
    const v = o[k];
    if (typeof v === 'string' && !esRuido(v)) return v.trim();
    if (Array.isArray(v)) {
      const j = v.filter((m): m is string => typeof m === 'string' && !!m.trim()).join(' ');
      if (j) return j;
    }
  }
  for (const k of ['data', 'body', 'response', 'errors']) {
    if (k in o) {
      const n = extraerDetalle(o[k], depth + 1);
      if (n) return n;
    }
  }
  return null;
}

function crudo(err: unknown): string | undefined {
  const o = err as Obj | null;
  const body = o?.data ?? (o?.response as Obj | undefined)?.data ?? (o instanceof Error ? o.message : err);
  if (body == null) return undefined;
  if (typeof body === 'string') return body.slice(0, 4000);
  try {
    return JSON.stringify(body).slice(0, 4000);
  } catch {
    return String(body);
  }
}

/** Contexto operativo para códigos frecuentes (mensaje para el usuario). */
export function enriquecer(mensaje: string): string {
  const m = mensaje.toLowerCase();
  if (m.includes('11002')) {
    return `${mensaje} El punto de venta no está habilitado para factura electrónica por web service. Dalo de alta en ARCA como "RECE / Web Services".`;
  }
  if (m.includes('10016')) {
    return `${mensaje} La fecha es anterior al último comprobante autorizado o el número quedó desfasado. Volvé a emitir.`;
  }
  if (m.includes('10049')) {
    return `${mensaje} Para servicios hay que informar período del servicio y vencimiento de pago.`;
  }
  if (m.includes('cms.sign.invalid')) {
    return `${mensaje} El certificado y la clave privada no son pareja: volvé a cargar ambos juntos.`;
  }
  if (m.includes('invalid xml') || m.includes('unexpected close tag')) {
    return 'AfipSDK no pudo leer la respuesta de ARCA. Probá de nuevo en unos minutos.';
  }
  return mensaje;
}

/** El padrón responde "No existe persona con ese Id" cuando el CUIT no figura: es "sin datos", no una falla. */
export function esPersonaInexistente(err: unknown): boolean {
  const detalle = extraerDetalle((err as Obj | null)?.data) ?? extraerDetalle(err);
  return /no existe persona/i.test(detalle ?? '');
}

/**
 * Convierte cualquier error del SDK en ArcaError.
 * `enviado`: la operación pudo haber llegado a ARCA (solo FECAESolicitar importa: define si el
 * resultado es INCIERTO).
 */
export function mapearError(err: unknown, enviado: boolean): ArcaError {
  if (err instanceof ArcaError) return err;
  const o = (err ?? {}) as Obj;
  const detalleCrudo = crudo(err);

  // AfipWebServiceError: ARCA respondió con Errors / Observaciones de rechazo → rechazo definitivo.
  // (los errores de axios también traen `code`, pero no numérico: 'ECONNABORTED', etc.)
  const codigo = o.code != null && String(o.code).trim() !== '' ? Number(o.code) : NaN;
  if (Number.isFinite(codigo) && o.status === undefined) {
    const msg = typeof o.message === 'string' ? o.message : `Código ${codigo}`;
    return new ArcaError('RECHAZO', enriquecer(`Rechazado por ARCA: ${msg}`), detalleCrudo, codigo);
  }

  const status = typeof o.status === 'number' ? o.status : undefined;
  const detalle = extraerDetalle(o.data) ?? extraerDetalle(err);

  if (status === 401 || status === 403) {
    return new ArcaError(
      'CONFIGURACION',
      `AfipSDK rechazó la API key (HTTP ${status}). Revisá AFIP_SDK_API_KEY en el servidor.`,
      detalleCrudo,
    );
  }

  const lower = (detalle ?? '').toLowerCase();
  if (status === 400 && (lower.includes('cert') || lower.includes('key') || lower.includes('tax_id'))) {
    return new ArcaError(
      'CONFIGURACION',
      enriquecer(`No se pudo autenticar con ARCA: ${detalle}. Revisá CUIT, certificado y clave privada.`),
      detalleCrudo,
    );
  }

  // 400: AfipSDK validó y rechazó el pedido antes de mandarlo a ARCA.
  if (status === 400) {
    return new ArcaError('RECHAZO', enriquecer(`Rechazado: ${detalle ?? 'datos inválidos'}`), detalleCrudo);
  }

  // Sin status (timeout, red), 5xx, 422 u otra cosa: si ya pudo haber llegado a ARCA, es incierto.
  const mensaje = enriquecer(detalle ?? 'No hubo respuesta de ARCA / AfipSDK.');
  return new ArcaError(enviado ? 'INCIERTO' : 'RECHAZO', mensaje, detalleCrudo);
}
