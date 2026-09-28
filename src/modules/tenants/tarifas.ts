import type { Moneda, OrigenItem, UnidadItem } from '@prisma/client';

// Elección de tarifa: función pura (ARCHITECTURE.md §7.3, paso 4). La más específica vigente gana.

export interface TarifaCandidata {
  id: string;
  origen: OrigenItem | null;
  claveExterna: string | null;
  descripcion: string | null;
  unidad: UnidadItem;
  precioUnitario: string;
  moneda: Moneda;
  alicuotaIva: string;
  vigenteDesde: string; // YYYY-MM-DD
  vigenteHasta: string | null;
}

export interface CriterioTarifa {
  origen?: OrigenItem;
  claveExterna?: string;
  /** Fecha a la que tiene que estar vigente (YYYY-MM-DD). */
  fecha: string;
  unidad?: UnidadItem;
}

/**
 * Filtra las tarifas vigentes que aplican y elige la más específica:
 * clave externa (proyecto) coincidente > sin clave; origen coincidente > cualquier origen;
 * a igual especificidad, la de vigencia más reciente.
 */
export function elegirTarifa<T extends TarifaCandidata>(tarifas: T[], c: CriterioTarifa): T | null {
  const aplicables = tarifas.filter(
    (t) =>
      t.vigenteDesde <= c.fecha &&
      (t.vigenteHasta === null || t.vigenteHasta >= c.fecha) &&
      (t.origen === null || t.origen === c.origen) &&
      (t.claveExterna === null || t.claveExterna === c.claveExterna) &&
      (!c.unidad || t.unidad === c.unidad),
  );
  const puntaje = (t: T) => (t.claveExterna !== null ? 2 : 0) + (t.origen !== null ? 1 : 0);
  aplicables.sort((a, b) => puntaje(b) - puntaje(a) || b.vigenteDesde.localeCompare(a.vigenteDesde));
  return aplicables[0] ?? null;
}

/** "{proyecto} - {periodo}" → "Web - Septiembre 2026". Variables desconocidas quedan vacías. */
export function descripcionDeTarifa(plantilla: string, variables: Record<string, string>): string {
  return plantilla.replace(/\{(\w+)\}/g, (_m, k: string) => variables[k] ?? '').replace(/\s+/g, ' ').trim();
}
