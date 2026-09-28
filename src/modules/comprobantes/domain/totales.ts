import Decimal from 'decimal.js';
import { ALICUOTAS_IVA, type Letra } from './codigos';

// Portado de Vialto (arca-cvlp.util.ts#buildComprobanteCvlp + arca-iva.util.ts#groupAlicuotasIva),
// con Decimal en vez de Float. Reglas de ARCA que respeta:
//  - 10051: AlicIva.Importe = BaseImp × % oficial.
//  - 10061: ImpNeto = Σ AlicIva.BaseImp.
//  - 10023: ImpIVA = Σ AlicIva.Importe (la diferencia de centavos con Σ IVA por línea se
//           absorbe en la línea de mayor base, para que el detalle cuadre con el pie).
//  - 10020: BaseImp > 0 (solo se informan alícuotas con base positiva).
// Factura C: no discrimina IVA → sin AlicIva, ImpIVA = 0, ImpNeto = total.

export interface LineaParaCalcular {
  cantidad: Decimal.Value;
  precioUnitario: Decimal.Value;
  bonificacionPct?: Decimal.Value;
  alicuotaIva: Decimal.Value;
}

export interface LineaCalculada {
  importeNeto: Decimal;
  importeIva: Decimal;
  importeTotal: Decimal;
}

export interface AlicuotaCalculada {
  arcaId: number;
  alicuota: Decimal;
  baseImponible: Decimal;
  importe: Decimal;
}

export interface TotalesComprobante {
  lineas: LineaCalculada[];
  alicuotas: AlicuotaCalculada[];
  importeNetoGravado: Decimal;
  importeNoGravado: Decimal;
  importeExento: Decimal;
  importeIva: Decimal;
  importeTributos: Decimal;
  importeTotal: Decimal;
}

export class TotalesInvalidosError extends Error {}

const CERO = new Decimal(0);

function r2(v: Decimal): Decimal {
  return v.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export function normalizarAlicuota(v: Decimal.Value): string {
  return new Decimal(v).toDecimalPlaces(1).toString();
}

export function arcaIdDeAlicuota(v: Decimal.Value): number {
  const id = ALICUOTAS_IVA[normalizarAlicuota(v)];
  if (id === undefined) {
    throw new TotalesInvalidosError(
      `Alícuota de IVA ${new Decimal(v).toString()}% no válida. Opciones: ${Object.keys(ALICUOTAS_IVA).join(', ')}.`,
    );
  }
  return id;
}

export function calcularTotales(lineas: LineaParaCalcular[], letra: Letra): TotalesComprobante {
  if (lineas.length === 0) {
    throw new TotalesInvalidosError('El comprobante necesita al menos una línea.');
  }

  const calculadas: LineaCalculada[] = lineas.map((l, i) => {
    const cantidad = new Decimal(l.cantidad);
    const precio = new Decimal(l.precioUnitario);
    const bonif = new Decimal(l.bonificacionPct ?? 0);
    if (cantidad.lte(0)) throw new TotalesInvalidosError(`Línea ${i + 1}: la cantidad debe ser mayor a 0.`);
    if (precio.lt(0)) throw new TotalesInvalidosError(`Línea ${i + 1}: el precio no puede ser negativo.`);
    if (bonif.lt(0) || bonif.gte(100)) {
      throw new TotalesInvalidosError(`Línea ${i + 1}: la bonificación debe estar entre 0 y 99,99 %.`);
    }
    // Valida la alícuota aunque en C no se use, para que el dato guardado sea coherente.
    arcaIdDeAlicuota(l.alicuotaIva);

    const neto = r2(cantidad.mul(precio).mul(new Decimal(100).minus(bonif)).div(100));
    if (letra === 'C') {
      return { importeNeto: neto, importeIva: CERO, importeTotal: neto };
    }
    const iva = r2(neto.mul(new Decimal(l.alicuotaIva)).div(100));
    return { importeNeto: neto, importeIva: iva, importeTotal: neto.plus(iva) };
  });

  const netoTotal = calculadas.reduce((s, l) => s.plus(l.importeNeto), CERO);
  if (netoTotal.lte(0)) {
    throw new TotalesInvalidosError('El total del comprobante debe ser mayor a 0.');
  }

  if (letra === 'C') {
    return {
      lineas: calculadas,
      alicuotas: [],
      importeNetoGravado: netoTotal,
      importeNoGravado: CERO,
      importeExento: CERO,
      importeIva: CERO,
      importeTributos: CERO,
      importeTotal: netoTotal,
    };
  }

  // Agrupar bases por alícuota (un registro por Id).
  const bases = new Map<number, { alicuota: Decimal; base: Decimal }>();
  lineas.forEach((l, i) => {
    const id = arcaIdDeAlicuota(l.alicuotaIva);
    const actual = bases.get(id) ?? { alicuota: new Decimal(normalizarAlicuota(l.alicuotaIva)), base: CERO };
    actual.base = actual.base.plus(calculadas[i].importeNeto);
    bases.set(id, actual);
  });

  const alicuotas: AlicuotaCalculada[] = [...bases.entries()]
    .filter(([, v]) => v.base.gt(0))
    .sort(([a], [b]) => a - b)
    .map(([arcaId, v]) => ({
      arcaId,
      alicuota: v.alicuota,
      baseImponible: r2(v.base),
      importe: r2(v.base.mul(v.alicuota).div(100)),
    }));

  const importeNetoGravado = alicuotas.reduce((s, a) => s.plus(a.baseImponible), CERO);
  const importeIva = alicuotas.reduce((s, a) => s.plus(a.importe), CERO);

  // Ajuste de centavos: Σ IVA por línea debe coincidir con ImpIVA.
  const ivaLineas = calculadas.reduce((s, l) => s.plus(l.importeIva), CERO);
  const diferencia = importeIva.minus(ivaLineas);
  if (!diferencia.isZero()) {
    let idx = 0;
    calculadas.forEach((l, i) => {
      if (l.importeNeto.abs().gt(calculadas[idx].importeNeto.abs())) idx = i;
    });
    const iva = calculadas[idx].importeIva.plus(diferencia);
    calculadas[idx] = { ...calculadas[idx], importeIva: iva, importeTotal: calculadas[idx].importeNeto.plus(iva) };
  }

  return {
    lineas: calculadas,
    alicuotas,
    importeNetoGravado,
    importeNoGravado: CERO,
    importeExento: CERO,
    importeIva,
    importeTributos: CERO,
    importeTotal: importeNetoGravado.plus(importeIva),
  };
}
