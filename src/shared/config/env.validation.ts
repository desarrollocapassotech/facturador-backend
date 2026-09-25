/** Fail-fast al arrancar: sin estas variables el servidor no levanta. */
export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const errores: string[] = [];

  for (const key of ['DATABASE_URL', 'JWT_SECRET', 'FRONTEND_URL']) {
    if (typeof config[key] !== 'string' || !(config[key] as string).trim()) {
      errores.push(`Falta la variable de entorno ${key}.`);
    }
  }

  const secret = config.JWT_SECRET;
  if (typeof secret === 'string' && secret.length < 32) {
    errores.push('JWT_SECRET debe tener al menos 32 caracteres.');
  }

  if (errores.length) {
    throw new Error(errores.join(' '));
  }

  return {
    ...config,
    JWT_EXPIRES_IN: config.JWT_EXPIRES_IN || '8h',
    PORT: config.PORT ? Number(config.PORT) : 3000,
  };
}
