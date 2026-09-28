import type { CondicionIva } from '@prisma/client';
import { esCondicionMonotributo, type Letra } from './codigos';

/**
 * Letra sugerida según emisor y receptor. El usuario puede cambiarla en el borrador
 * (ARCHITECTURE.md §10 D3): esto es solo el valor inicial y la base de la advertencia.
 */
export function sugerirLetra(emisor: CondicionIva, receptor: CondicionIva): Letra {
  if (emisor !== 'RESPONSABLE_INSCRIPTO') return 'C';
  if (receptor === 'RESPONSABLE_INSCRIPTO' || esCondicionMonotributo(receptor)) return 'A';
  return 'B';
}
