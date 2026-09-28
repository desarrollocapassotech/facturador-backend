import { execFileSync } from 'child_process';
import { generateKeyPairSync } from 'crypto';
import { mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { analizarCertificado, CertificadoInvalidoError } from './certificado.util';

// Genera un certificado autofirmado con openssl si está disponible (Git Bash / Linux CI lo traen).
function generarCertificado(dias: number): { cert: string; key: string } | null {
  try {
    const dir = mkdtempSync(join(tmpdir(), 'cert-'));
    const keyPath = join(dir, 'k.pem');
    const certPath = join(dir, 'c.pem');
    execFileSync(
      'openssl',
      [
        'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyPath, '-out', certPath,
        '-days', String(dias), '-subj', '/CN=facturador-test/serialNumber=CUIT 20409378472',
      ],
      { stdio: 'ignore' },
    );
    return { cert: readFileSync(certPath, 'utf8'), key: readFileSync(keyPath, 'utf8') };
  } catch {
    return null;
  }
}

const par = generarCertificado(30);
const d = par ? describe : describe.skip;

d('analizarCertificado', () => {
  it('lee alias, CUIT, huella y vencimiento', () => {
    const info = analizarCertificado(par!.cert, par!.key);
    expect(info.alias).toBe('facturador-test');
    expect(info.cuitDelCertificado).toBe('20409378472');
    expect(info.huellaSha256).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
    expect(info.venceEl.getTime()).toBeGreaterThan(Date.now());
  });

  it('acepta PEM con \\n literales (como en un .env)', () => {
    const escapado = par!.cert.replace(/\n/g, '\\n');
    expect(() => analizarCertificado(escapado, par!.key)).not.toThrow();
  });

  it('rechaza una clave que no es pareja del certificado', () => {
    const otra = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({
      type: 'pkcs8',
      format: 'pem',
    }) as string;
    expect(() => analizarCertificado(par!.cert, otra)).toThrow('no corresponde');
  });

  it('rechaza un certificado vencido', () => {
    expect(() => analizarCertificado(par!.cert, par!.key, new Date('2999-01-01'))).toThrow(CertificadoInvalidoError);
  });

  it('rechaza basura', () => {
    expect(() => analizarCertificado('hola', par!.key)).toThrow('PEM válido');
  });
});
