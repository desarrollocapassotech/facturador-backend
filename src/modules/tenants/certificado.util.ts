import { createPrivateKey, X509Certificate } from 'crypto';

export interface InfoCertificado {
  alias: string | null;
  huellaSha256: string;
  venceEl: Date;
  cuitDelCertificado: string | null;
}

export class CertificadoInvalidoError extends Error {}

export function normalizarPem(pem: string): string {
  return pem.replace(/\\r/g, '').replace(/\\n/g, '\n').replace(/\r/g, '').trim() + '\n';
}

/**
 * Valida un par certificado + clave privada de ARCA:
 * formato PEM, que la clave corresponda al certificado (evita "cms.sign.invalid") y vigencia.
 */
export function analizarCertificado(certPem: string, keyPem: string, ahora = new Date()): InfoCertificado {
  let cert: X509Certificate;
  try {
    cert = new X509Certificate(normalizarPem(certPem));
  } catch {
    throw new CertificadoInvalidoError('El certificado no es un PEM válido (debe empezar con -----BEGIN CERTIFICATE-----).');
  }

  let key;
  try {
    key = createPrivateKey(normalizarPem(keyPem));
  } catch {
    throw new CertificadoInvalidoError('La clave privada no es un PEM válido o está protegida con contraseña.');
  }

  if (!cert.checkPrivateKey(key)) {
    throw new CertificadoInvalidoError('La clave privada no corresponde a este certificado.');
  }

  const venceEl = new Date(cert.validTo);
  if (venceEl <= ahora) {
    throw new CertificadoInvalidoError(`El certificado venció el ${venceEl.toISOString().slice(0, 10)}.`);
  }

  // Los certificados de ARCA traen "serialNumber=CUIT 20123456789" en el subject.
  const cuit = /serialNumber=CUIT\s*(\d{11})/i.exec(cert.subject)?.[1] ?? null;
  const alias = /CN=([^\n,]+)/.exec(cert.subject)?.[1]?.trim() ?? null;

  return { alias, huellaSha256: cert.fingerprint256, venceEl, cuitDelCertificado: cuit };
}
