import type { TipoDocumento } from '@prisma/client';
import { esCuitValido } from '../../shared/util/cuit';

/** Normaliza y valida el documento del receptor. Devuelve el número limpio o un mensaje de error. */
export function normalizarDocumento(
  tipo: TipoDocumento,
  numero: string,
): { ok: true; numero: string } | { ok: false; error: string } {
  if (tipo === 'CONSUMIDOR_FINAL') return { ok: true, numero: '0' };

  if (tipo === 'PASAPORTE') {
    const limpio = numero.trim().toUpperCase();
    return /^[A-Z0-9]{5,20}$/.test(limpio)
      ? { ok: true, numero: limpio }
      : { ok: false, error: 'El pasaporte debe tener entre 5 y 20 letras o números.' };
  }

  const digitos = numero.replace(/[-.\s]/g, '');
  if (!/^\d+$/.test(digitos)) return { ok: false, error: 'El documento solo puede tener números.' };

  if (tipo === 'DNI') {
    return /^\d{7,8}$/.test(digitos)
      ? { ok: true, numero: digitos }
      : { ok: false, error: 'El DNI debe tener 7 u 8 dígitos.' };
  }

  // CUIT / CUIL
  return esCuitValido(digitos)
    ? { ok: true, numero: digitos }
    : { ok: false, error: `El ${tipo} ${numero} no es válido (revisá el dígito verificador).` };
}
