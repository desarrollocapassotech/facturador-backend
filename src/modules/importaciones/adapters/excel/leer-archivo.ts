import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import type { PlantillaMapeoConfig } from './plantilla-mapeo';

// Lee .xlsx (exceljs) o .csv (csv-parse) como matriz de celdas. No usa el paquete `xlsx` de npm:
// la versión publicada tiene vulnerabilidades conocidas al leer archivos manipulados.

export type Celda = string | number | boolean | Date | null;

export class ArchivoInvalidoError extends Error {}

export const MAX_FILAS = 5000;

export function formatoDeArchivo(nombre: string): 'xlsx' | 'csv' {
  const n = nombre.toLowerCase();
  if (n.endsWith('.xlsx')) return 'xlsx';
  if (n.endsWith('.csv') || n.endsWith('.txt')) return 'csv';
  if (n.endsWith('.xls')) throw new ArchivoInvalidoError('El formato .xls (Excel 97-2003) no está soportado: guardalo como .xlsx o CSV.');
  throw new ArchivoInvalidoError('El archivo tiene que ser .xlsx o .csv.');
}

function celdaExcel(v: ExcelJS.CellValue): Celda {
  if (v === null || v === undefined) return null;
  if (v instanceof Date || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
  if (typeof v === 'object') {
    if ('result' in v) return celdaExcel((v as ExcelJS.CellFormulaValue).result as ExcelJS.CellValue);
    if ('richText' in v) return (v as ExcelJS.CellRichTextValue).richText.map((t) => t.text).join('');
    if ('text' in v) return String((v as ExcelJS.CellHyperlinkValue).text);
    if ('error' in v) return null;
  }
  return String(v);
}

export async function leerXlsx(buffer: Buffer, hoja?: string | number): Promise<{ hojas: string[]; filas: Celda[][] }> {
  const libro = new ExcelJS.Workbook();
  try {
    await libro.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new ArchivoInvalidoError('El archivo no es un Excel .xlsx válido.');
  }
  const hojas = libro.worksheets.map((w) => w.name);
  const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
  let ws: ExcelJS.Worksheet | undefined;
  if (hoja === undefined || hoja === null || hoja === '') ws = libro.worksheets[0];
  else if (typeof hoja === 'number') ws = libro.worksheets[hoja];
  else ws = libro.worksheets.find((w) => normalizar(w.name) === normalizar(hoja));
  if (!ws) throw new ArchivoInvalidoError(`No se encontró la hoja "${String(hoja)}". Hojas del archivo: ${hojas.join(', ')}.`);
  if (ws.rowCount > MAX_FILAS + 100) throw new ArchivoInvalidoError(`El archivo tiene más de ${MAX_FILAS} filas.`);

  const filas: Celda[][] = [];
  ws.eachRow({ includeEmpty: true }, (row, n) => {
    const valores = (row.values as ExcelJS.CellValue[]).slice(1); // exceljs indexa desde 1
    filas[n - 1] = valores.map(celdaExcel);
  });
  for (let i = 0; i < filas.length; i++) filas[i] ??= [];
  return { hojas, filas };
}

export function leerCsv(buffer: Buffer, cfg: Pick<PlantillaMapeoConfig, 'delimitador' | 'encoding'>): Celda[][] {
  const texto = new TextDecoder(cfg.encoding === 'latin1' ? 'latin1' : 'utf-8').decode(buffer).replace(/^\uFEFF/, '');
  const delimitador = cfg.delimitador ?? detectarDelimitador(texto);
  try {
    const filas = parse(texto, { delimiter: delimitador, relax_column_count: true, skip_empty_lines: false, bom: true }) as string[][];
    if (filas.length > MAX_FILAS + 100) throw new ArchivoInvalidoError(`El archivo tiene más de ${MAX_FILAS} filas.`);
    return filas;
  } catch (err) {
    if (err instanceof ArchivoInvalidoError) throw err;
    throw new ArchivoInvalidoError(`No se pudo leer el CSV: ${(err as Error).message}`);
  }
}

/** Elige entre ; , y tab según la primera línea (en Argentina Excel exporta con ;). */
export function detectarDelimitador(texto: string): ',' | ';' | '\t' {
  const primera = texto.split(/\r?\n/, 1)[0] ?? '';
  const cuenta = (c: string) => primera.split(c).length - 1;
  const opciones: Array<',' | ';' | '\t'> = [';', ',', '\t'];
  return opciones.reduce((mejor, c) => (cuenta(c) > cuenta(mejor) ? c : mejor), ';');
}

export async function leerArchivo(
  buffer: Buffer,
  nombre: string,
  cfg: Pick<PlantillaMapeoConfig, 'hoja' | 'delimitador' | 'encoding'>,
): Promise<{ formato: 'xlsx' | 'csv'; hojas: string[]; filas: Celda[][] }> {
  const formato = formatoDeArchivo(nombre);
  if (formato === 'xlsx') {
    const { hojas, filas } = await leerXlsx(buffer, cfg.hoja);
    return { formato, hojas, filas };
  }
  return { formato, hojas: [], filas: leerCsv(buffer, cfg) };
}
