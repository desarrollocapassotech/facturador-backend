import { claveCifradoEnv } from '../crypto/cifrado';

/** Fail-fast al arrancar: sin estas variables el servidor no levanta. */
export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const errores: string[] = [];

  for (const key of ['DATABASE_URL', 'JWT_SECRET', 'FRONTEND_URL']) {
    if (typeof config[key] !== 'string' || !(config[key] as string).trim()) {
      errores.push(`Falta la variable de entorno ${key}.`);
    }
  }
  // Se acepta también el nombre viejo, FACTURADOR_ENCRYPTION_KEY (ver cifrado.ts).
  const claveCifrado = claveCifradoEnv(config);
  if (!claveCifrado?.trim()) {
    errores.push('Falta la variable de entorno FAKTIA_ENCRYPTION_KEY.');
  }

  for (const [key, v] of [
    ['JWT_SECRET', config.JWT_SECRET],
    ['FAKTIA_ENCRYPTION_KEY', claveCifrado],
  ] as const) {
    if (typeof v === 'string' && v.length > 0 && v.length < 32) {
      errores.push(`${key} debe tener al menos 32 caracteres.`);
    }
  }

  if (errores.length) {
    throw new Error(errores.join(' '));
  }

  // AFIP_SDK_API_KEY es opcional para arrancar: sin ella no se puede emitir, y la pantalla de
  // configuración lo muestra.
  return {
    ...config,
    JWT_EXPIRES_IN: config.JWT_EXPIRES_IN || '8h',
    PORT: config.PORT ? Number(config.PORT) : 3000,
  };
}
