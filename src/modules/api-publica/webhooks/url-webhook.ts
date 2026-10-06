import { isIP } from 'net';

// Validación de la URL de un webhook. En producción: solo https y nunca direcciones internas
// (evita usar el Facturador para pegarle a la red privada del servidor). Es un control sobre el
// texto de la URL; la resolución DNS a IPs privadas se vuelve a chequear al enviar.

const HOSTS_LOCALES = ['localhost', 'localhost.localdomain', '0.0.0.0', 'metadata.google.internal'];

export function esIpPrivada(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  if (v === 6) {
    const x = ip.toLowerCase();
    if (x.startsWith('::ffff:')) return esIpPrivada(x.slice(7));
    return x === '::1' || x === '::' || x.startsWith('fc') || x.startsWith('fd') || x.startsWith('fe80');
  }
  return false;
}

/** Traduce un error de red de fetch/dns (que solo dice "fetch failed") a algo que el usuario entienda. */
export function mensajeErrorConexion(err: unknown): string {
  const e = err as { name?: string; message?: string; code?: string; cause?: { code?: string } } | null;
  const codigo = e?.cause?.code ?? e?.code ?? '';
  if (codigo === 'ENOTFOUND' || codigo === 'EAI_AGAIN') return 'No se encontró el dominio de la URL (DNS).';
  if (codigo === 'ECONNREFUSED') return 'El servidor del receptor rechazó la conexión.';
  if (codigo === 'ECONNRESET' || codigo === 'UND_ERR_SOCKET') return 'El receptor cortó la conexión.';
  if (codigo === 'ETIMEDOUT' || codigo === 'UND_ERR_CONNECT_TIMEOUT') return 'No se pudo conectar con el receptor (tiempo agotado).';
  if (/CERT|SSL|TLS|SELF_SIGNED|UNABLE_TO_VERIFY/i.test(codigo)) return 'El certificado HTTPS del receptor no es válido.';
  const msg = e?.message ?? String(err);
  return codigo ? `No se pudo conectar con el receptor (${codigo}).` : msg === 'fetch failed' ? 'No se pudo conectar con el receptor.' : msg;
}

export function validarUrlWebhook(cruda: string, produccion: boolean): string {
  let u: URL;
  try {
    u = new URL(cruda.trim());
  } catch {
    throw new Error('La URL del webhook no es válida.');
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('La URL del webhook tiene que ser http o https.');
  if (produccion && u.protocol !== 'https:') throw new Error('La URL del webhook tiene que ser https.');
  if (u.username || u.password) throw new Error('La URL del webhook no puede tener usuario ni contraseña.');
  if (u.hash) throw new Error('La URL del webhook no puede tener #.');
  if (u.href.length > 500) throw new Error('La URL del webhook es demasiado larga.');
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (produccion && (HOSTS_LOCALES.includes(host) || host.endsWith('.localhost') || host.endsWith('.internal') || esIpPrivada(host))) {
    throw new Error('La URL del webhook no puede apuntar a una dirección interna.');
  }
  return u.href;
}
