import * as bcrypt from 'bcryptjs';

const BCRYPT_COST = 12;

export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export function verificarPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Reglas mínimas para contraseñas creadas por script. */
export function validarPassword(password: string): string | null {
  if (password.length < 10) return 'La contraseña debe tener al menos 10 caracteres.';
  if (password.length > 72) return 'La contraseña no puede superar 72 caracteres (límite de bcrypt).';
  return null;
}
