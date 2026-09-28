import { randomInt } from 'crypto';

/**
 * CUIT único para tenants de tests de integración (la columna es única). Aleatorio y no basado
 * en la hora: los tests corren en paralelo y dos workers pueden crear un tenant en el mismo ms.
 * No se valida el dígito verificador en esos tests.
 */
export function cuitDePrueba(): string {
  return `3${String(randomInt(0, 10_000_000_000)).padStart(10, '0')}`;
}
