/** Fail-fast al arrancar: sin estas variables el servidor no levanta. */
export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const errores: string[] = [];

  for (const key of ['DATABASE_URL', 'JWT_SECRET', 'FRONTEND_URL', 'FACTURADOR_ENCRYPTION_KEY']) {
    if (typeof config[key] !== 'string' || !(config[key] as string).trim()) {
      errores.push(`Falta la variable de entorno ${key}.`);
    }
  }

  for (const key of ['JWT_SECRET', 'FACTURADOR_ENCRYPTION_KEY']) {
    const v = config[key];
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
