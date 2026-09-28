import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

// Adaptado de Vialto (shared/util/arca-crypto.ts): AES-256-GCM, sin la rama CBC heredada
// y con prefijo de versión para poder rotar la clave más adelante.
const VERSION = 'v1';
const IV_BYTES = 12;

function clave(): Buffer {
  const raw = process.env.FACTURADOR_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error('Falta la variable de entorno FACTURADOR_ENCRYPTION_KEY.');
  }
  return createHash('sha256').update(raw).digest();
}

export function cifrar(texto: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', clave(), iv);
  const cifrado = Buffer.concat([cipher.update(texto, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('hex'), tag.toString('hex'), cifrado.toString('hex')].join(':');
}

export function descifrar(valor: string): string {
  const partes = valor.split(':');
  if (partes.length !== 4 || partes[0] !== VERSION) {
    throw new Error('Formato de dato cifrado desconocido.');
  }
  const [, ivHex, tagHex, datosHex] = partes;
  try {
    const decipher = createDecipheriv('aes-256-gcm', clave(), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(datosHex, 'hex')), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('No se pudo descifrar el dato: está corrupto o FACTURADOR_ENCRYPTION_KEY cambió.');
  }
}
