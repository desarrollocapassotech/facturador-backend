import { createHash, randomBytes, timingSafeEqual } from 'crypto';

// API keys de integración y tokens de acceso: secretos de alta entropía que se guardan
// hasheados (SHA-256). Nunca se loguean ni se guardan en claro.

export const SCOPES = ['items:write', 'comprobantes:write', 'comprobantes:read', 'acceso:emitir'] as const;
export type Scope = (typeof SCOPES)[number];

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'; // sin 0/O/1/l/I

function aleatorio(largo: number): string {
  // Rechazo por módulo: sin sesgo hacia los primeros caracteres del alfabeto.
  const limite = 256 - (256 % ALFABETO.length);
  let salida = '';
  while (salida.length < largo) {
    for (const b of randomBytes(largo * 2)) {
      if (b < limite) salida += ALFABETO[b % ALFABETO.length];
      if (salida.length === largo) break;
    }
  }
  return salida;
}

export function sha256Hex(valor: string): string {
  return createHash('sha256').update(valor, 'utf8').digest('hex');
}

/** Compara dos hashes hex en tiempo constante. */
export function hashesIguales(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ba.length === bb.length && ba.length > 0 && timingSafeEqual(ba, bb);
}

/** `fct_<prefijo 8>_<secreto 32>`. El prefijo (`fct_<8>`) es público y sirve para buscarla. */
export function generarApiKey(): { clave: string; prefijo: string; hash: string } {
  const prefijo = `fct_${aleatorio(8)}`;
  const clave = `${prefijo}_${aleatorio(32)}`;
  return { clave, prefijo, hash: sha256Hex(clave) };
}

/** Devuelve el prefijo público si la clave tiene el formato correcto; null si no. */
export function prefijoDeApiKey(clave: string): string | null {
  const m = /^(fct_[A-Za-z0-9]{8})_[A-Za-z0-9]{32}$/.exec(clave.trim());
  return m ? m[1] : null;
}

/** Token de acceso de un solo uso: 32 bytes aleatorios en base64url. */
export function generarTokenAcceso(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: sha256Hex(token) };
}

export function tokenAccesoConFormato(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

// Rutas del frontend a las que puede llevar un token de acceso (evita open redirect).
const DESTINOS = ['/comprobantes', '/importaciones', '/clientes', '/recibos', '/configuracion'];

/** Path relativo de la lista blanca, o null. Acepta subrutas y query simple ("/importaciones/abc?x=1"). */
export function destinoSeguro(destino: string | undefined | null): string | null {
  if (!destino) return null;
  const d = destino.trim();
  if (d.length > 200 || !/^\/[A-Za-z0-9/_-]*(\?[A-Za-z0-9=&_-]*)?$/.test(d) || d.includes('//')) return null;
  const ruta = d.split('?')[0];
  return DESTINOS.some((base) => ruta === base || ruta.startsWith(`${base}/`)) ? d : null;
}
