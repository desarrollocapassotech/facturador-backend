import { createHash } from 'crypto';
import type { Advertencia, ItemFacturableInput, TipoDocumentoRef, UnidadItem } from '../../domain/item-facturable';
import type { Celda } from './leer-archivo';
import type { ColumnaMapeo, PlantillaMapeoConfig } from './plantilla-mapeo';

// Filas de una planilla → ItemFacturableInput, según la plantilla de mapeo. Función pura.
// Lo que no se puede convertir se pasa tal cual: la validación del staging lo marca con error.

function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function vacia(v: Celda): boolean {
  return v === null || (typeof v === 'string' && v.trim() === '');
}

function texto(v: Celda): string {
  if (v === null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

/** "$ 1.234,50" con separador ',' → "1234.50". Números de Excel se respetan. */
export function aDecimal(v: Celda, separador: ',' | '.' = ','): string {
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  let t = texto(v).replace(/[\s$%]|US\$|U\$S|ARS|USD/gi, '');
  if (separador === ',') t = t.replace(/\./g, '').replace(',', '.');
  else t = t.replace(/,/g, '');
  return t;
}

function ymd(a: number, m: number, d: number): string | null {
  if (a < 100) a += 2000;
  const f = new Date(Date.UTC(a, m - 1, d));
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return null;
  return f.toISOString().slice(0, 10);
}

/** Fecha de Excel (Date o serial), "DD/MM/YYYY", "YYYY-MM-DD" o según `formato` → "YYYY-MM-DD". Si no se puede, el texto original. */
export function aFecha(v: Celda, formato?: string): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10); // exceljs entrega las fechas en UTC
  if (typeof v === 'number') {
    // Serial de Excel (días desde 1899-12-30).
    return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86_400_000).toISOString().slice(0, 10);
  }
  const t = texto(v);
  if (formato) {
    const partes = formato.toUpperCase().split(/[/\-.]/);
    const nums = t.split(/[/\-.]/).map(Number);
    if (partes.length === nums.length && !nums.some(Number.isNaN)) {
      const get = (p: string) => nums[partes.findIndex((x) => x.startsWith(p))];
      const r = ymd(get('Y'), get('M'), get('D'));
      if (r) return r;
    }
  }
  let m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/.exec(t);
  if (m) return ymd(Number(m[3]), Number(m[2]), Number(m[1])) ?? t;
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return ymd(Number(m[1]), Number(m[2]), Number(m[3])) ?? t;
  return t;
}

export function aUnidad(v: string): UnidadItem | string {
  const t = normalizar(v);
  if (['hora', 'horas', 'hs', 'h', 'hr', 'hrs'].includes(t)) return 'HORA';
  if (['unidad', 'unidades', 'u', 'un', 'u.', 'unid'].includes(t)) return 'UNIDAD';
  if (['servicio', 'servicios', 'serv', 'serv.'].includes(t)) return 'SERVICIO';
  if (['mes', 'meses', 'mensual', 'abono'].includes(t)) return 'MES';
  return v.toUpperCase();
}

export function aMoneda(v: string): 'ARS' | 'USD' | string {
  const t = normalizar(v).replace(/\s/g, '');
  if (['usd', 'us$', 'u$s', 'dolar', 'dolares', 'u$d'].includes(t)) return 'USD';
  if (['ars', '$', 'pesos', 'peso', 'pes'].includes(t)) return 'ARS';
  return v.toUpperCase();
}

function tipoDocumentoDe(numero: string, declarado: string): TipoDocumentoRef {
  const d = normalizar(declarado);
  if (d === 'cuit') return 'CUIT';
  if (d === 'cuil') return 'CUIL';
  if (d === 'dni') return 'DNI';
  if (d === 'pasaporte') return 'PASAPORTE';
  const digitos = numero.replace(/\D/g, '');
  return digitos.length === 11 ? 'CUIT' : digitos.length === 7 || digitos.length === 8 ? 'DNI' : 'CUIT';
}

function indiceDe(encabezados: string[], col: Pick<ColumnaMapeo, 'encabezado' | 'alias'>): number {
  const buscados = [col.encabezado, ...(col.alias ?? [])].map(normalizar);
  return encabezados.findIndex((h) => buscados.includes(h));
}

export function mapearFilas(
  filas: Celda[][],
  cfg: PlantillaMapeoConfig,
  opciones: { prefijoReferencia: string },
): { items: ItemFacturableInput[]; advertencias: Advertencia[]; filasLeidas: number } {
  const advertencias: Advertencia[] = [];
  const iEnc = cfg.filaEncabezado - 1;
  const encabezados = (filas[iEnc] ?? []).map((h) => normalizar(texto(h)));
  if (!encabezados.some(Boolean)) {
    return { items: [], advertencias: [{ mensaje: `La fila ${cfg.filaEncabezado} no tiene encabezados.` }], filasLeidas: 0 };
  }

  const columnas = cfg.columnas.map((col) => ({ col, idx: indiceDe(encabezados, col) }));
  for (const { col, idx } of columnas) {
    if (idx < 0) advertencias.push({ mensaje: `No se encontró la columna "${col.encabezado}" (campo ${col.campo}).` });
  }
  const refIdx = (cfg.referencia?.columnas ?? []).map((enc) => ({ enc, idx: indiceDe(encabezados, { encabezado: enc }) }));
  for (const r of refIdx) if (r.idx < 0) advertencias.push({ mensaje: `No se encontró la columna de referencia "${r.enc}".` });

  const items: ItemFacturableInput[] = [];
  let filasLeidas = 0;
  for (let i = iEnc + 1; i < filas.length; i++) {
    const fila = filas[i] ?? [];
    if (fila.every(vacia)) continue;
    filasLeidas++;
    const numeroFila = i + 1;

    const v: Record<string, string> = {};
    const metadatos: Record<string, unknown> = { fila: numeroFila };
    for (const { col, idx } of columnas) {
      if (idx < 0) continue;
      const celda = fila[idx] ?? null;
      if (vacia(celda)) continue;
      const valor =
        col.tipo === 'fecha' ? aFecha(celda, col.formatoFecha) : col.tipo === 'decimal' || col.tipo === 'numero' ? aDecimal(celda, col.separadorDecimal ?? ',') : texto(celda);
      if (col.campo.startsWith('metadatos.')) metadatos[col.campo.slice('metadatos.'.length)] = valor;
      else v[col.campo] = valor;
    }

    const refValores = refIdx.filter((r) => r.idx >= 0).map((r) => texto(fila[r.idx] ?? null));
    const referencia = v.referenciaExterna
      ? v.referenciaExterna
      : refValores.length && refValores.some(Boolean)
        ? refValores.join('|')
        : `fila:${createHash('sha256').update(JSON.stringify(fila.map(texto))).digest('hex').slice(0, 24)}`;

    const numeroDocumento = v['cliente.numeroDocumento'];
    const desde = v['periodo.desde'];
    const hasta = v['periodo.hasta'];
    items.push({
      origen: 'EXCEL',
      referenciaExterna: `${opciones.prefijoReferencia}:${referencia}`,
      cliente: {
        ...(numeroDocumento ? { numeroDocumento, tipoDocumento: tipoDocumentoDe(numeroDocumento, v['cliente.tipoDocumento'] ?? '') } : {}),
        ...(v['cliente.referenciaExterna'] ? { referenciaExterna: v['cliente.referenciaExterna'] } : {}),
        ...(v['cliente.razonSocial'] ? { alta: { razonSocial: v['cliente.razonSocial'] } } : {}),
      },
      descripcion: v.descripcion ?? '',
      cantidad: v.cantidad ?? '',
      unidad: (v.unidad ? aUnidad(v.unidad) : cfg.valoresPorDefecto?.unidad ?? 'UNIDAD') as UnidadItem,
      ...(v.precioUnitario ? { precioUnitario: v.precioUnitario } : {}),
      moneda: (v.moneda ? aMoneda(v.moneda) : cfg.valoresPorDefecto?.moneda) as 'ARS' | 'USD' | undefined,
      ...(v.alicuotaIva || cfg.valoresPorDefecto?.alicuotaIva
        ? { alicuotaIva: v.alicuotaIva ? v.alicuotaIva.replace(/\.0+$/, '') : cfg.valoresPorDefecto?.alicuotaIva }
        : {}),
      ...(v.fecha ? { fecha: v.fecha } : {}),
      ...(desde || hasta ? { periodo: { desde: desde ?? hasta, hasta: hasta ?? desde } } : {}),
      metadatos,
    });
    if (items.length >= 5000) {
      advertencias.push({ mensaje: 'Se importaron solo las primeras 5000 filas.' });
      break;
    }
  }
  return { items, advertencias, filasLeidas };
}
