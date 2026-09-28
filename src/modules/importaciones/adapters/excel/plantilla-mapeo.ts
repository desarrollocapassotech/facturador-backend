// Configuración de una plantilla de mapeo Excel/CSV (ARCHITECTURE.md §7.4).

export const CAMPOS_MAPEO = [
  'referenciaExterna',
  'descripcion',
  'cantidad',
  'unidad',
  'precioUnitario',
  'moneda',
  'alicuotaIva',
  'fecha',
  'periodo.desde',
  'periodo.hasta',
  'cliente.numeroDocumento',
  'cliente.tipoDocumento',
  'cliente.referenciaExterna',
  'cliente.razonSocial',
] as const;

export type CampoFijo = (typeof CAMPOS_MAPEO)[number];
export type CampoMapeo = CampoFijo | `metadatos.${string}`;
export type TipoColumna = 'texto' | 'numero' | 'fecha' | 'decimal';

export interface ColumnaMapeo {
  campo: CampoMapeo;
  encabezado: string;
  alias?: string[];
  tipo: TipoColumna;
  formatoFecha?: string; // "DD/MM/YYYY"
  separadorDecimal?: ',' | '.';
}

export interface PlantillaMapeoConfig {
  hoja?: string | number; // xlsx: nombre o índice (0-based)
  filaEncabezado: number; // 1-based
  delimitador?: ',' | ';' | '\t'; // csv
  encoding?: 'utf-8' | 'latin1';
  columnas: ColumnaMapeo[];
  valoresPorDefecto?: { unidad?: 'HORA' | 'UNIDAD' | 'SERVICIO' | 'MES'; alicuotaIva?: string; moneda?: 'ARS' | 'USD' };
  /** Columna(s) que forman la referencia; si no hay, se usa un hash de la fila. */
  referencia?: { columnas: string[] };
}

const TIPOS: TipoColumna[] = ['texto', 'numero', 'fecha', 'decimal'];

/** Valida la forma de la config (viene como JSON del usuario). Devuelve la lista de problemas. */
export function validarConfig(c: unknown): string[] {
  const errores: string[] = [];
  if (!c || typeof c !== 'object') return ['La configuración tiene que ser un objeto.'];
  const cfg = c as Partial<PlantillaMapeoConfig>;
  if (!Number.isInteger(cfg.filaEncabezado) || (cfg.filaEncabezado as number) < 1 || (cfg.filaEncabezado as number) > 100) {
    errores.push('filaEncabezado tiene que ser un número de fila entre 1 y 100.');
  }
  if (cfg.delimitador !== undefined && ![',', ';', '\t'].includes(cfg.delimitador)) errores.push('El delimitador tiene que ser coma, punto y coma o tabulación.');
  if (cfg.encoding !== undefined && !['utf-8', 'latin1'].includes(cfg.encoding)) errores.push('La codificación tiene que ser utf-8 o latin1.');
  if (!Array.isArray(cfg.columnas) || cfg.columnas.length === 0) {
    errores.push('La plantilla necesita al menos una columna.');
    return errores;
  }
  if (cfg.columnas.length > 60) errores.push('La plantilla admite hasta 60 columnas.');
  const vistos = new Set<string>();
  cfg.columnas.forEach((col, i) => {
    const n = `Columna ${i + 1}`;
    if (!col || typeof col !== 'object') return void errores.push(`${n}: formato inválido.`);
    const campoOk =
      (CAMPOS_MAPEO as readonly string[]).includes(col.campo) || (/^metadatos\.[A-Za-z0-9_]{1,40}$/.test(String(col.campo)));
    if (!campoOk) errores.push(`${n}: el campo "${String(col.campo)}" no existe.`);
    if (vistos.has(col.campo)) errores.push(`${n}: el campo "${col.campo}" está repetido.`);
    vistos.add(col.campo);
    if (typeof col.encabezado !== 'string' || !col.encabezado.trim() || col.encabezado.length > 100) errores.push(`${n}: falta el encabezado.`);
    if (col.alias !== undefined && (!Array.isArray(col.alias) || col.alias.some((a) => typeof a !== 'string'))) errores.push(`${n}: alias inválidos.`);
    if (!TIPOS.includes(col.tipo)) errores.push(`${n}: el tipo tiene que ser texto, numero, fecha o decimal.`);
    if (col.separadorDecimal !== undefined && ![',', '.'].includes(col.separadorDecimal)) errores.push(`${n}: el separador decimal tiene que ser coma o punto.`);
  });
  for (const requerido of ['descripcion', 'cantidad'] as const) {
    if (!vistos.has(requerido)) errores.push(`Falta mapear la columna de "${requerido}".`);
  }
  if (!['cliente.numeroDocumento', 'cliente.referenciaExterna'].some((c) => vistos.has(c))) {
    errores.push('Falta mapear una columna que identifique al cliente (documento o referencia).');
  }
  if (cfg.referencia && (!Array.isArray(cfg.referencia.columnas) || cfg.referencia.columnas.some((x) => typeof x !== 'string'))) {
    errores.push('referencia.columnas tiene que ser una lista de encabezados.');
  }
  return errores;
}
