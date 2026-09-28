import type {
  ConceptoArca,
  CondicionIva,
  Moneda,
  TipoComprobante,
  TipoDocumento,
} from '@prisma/client';

export type Letra = 'A' | 'B' | 'C';
export type Clase = 'FACTURA' | 'NOTA_DEBITO' | 'NOTA_CREDITO';

export const TIPOS_COMPROBANTE: Record<
  TipoComprobante,
  { codigo: number; letra: Letra; clase: Clase; titulo: string }
> = {
  FACTURA_A: { codigo: 1, letra: 'A', clase: 'FACTURA', titulo: 'FACTURA' },
  NOTA_DEBITO_A: { codigo: 2, letra: 'A', clase: 'NOTA_DEBITO', titulo: 'NOTA DE DÉBITO' },
  NOTA_CREDITO_A: { codigo: 3, letra: 'A', clase: 'NOTA_CREDITO', titulo: 'NOTA DE CRÉDITO' },
  FACTURA_B: { codigo: 6, letra: 'B', clase: 'FACTURA', titulo: 'FACTURA' },
  NOTA_DEBITO_B: { codigo: 7, letra: 'B', clase: 'NOTA_DEBITO', titulo: 'NOTA DE DÉBITO' },
  NOTA_CREDITO_B: { codigo: 8, letra: 'B', clase: 'NOTA_CREDITO', titulo: 'NOTA DE CRÉDITO' },
  FACTURA_C: { codigo: 11, letra: 'C', clase: 'FACTURA', titulo: 'FACTURA' },
  NOTA_DEBITO_C: { codigo: 12, letra: 'C', clase: 'NOTA_DEBITO', titulo: 'NOTA DE DÉBITO' },
  NOTA_CREDITO_C: { codigo: 13, letra: 'C', clase: 'NOTA_CREDITO', titulo: 'NOTA DE CRÉDITO' },
};

export function tipoComprobante(letra: Letra, clase: Clase): TipoComprobante {
  const encontrado = (Object.keys(TIPOS_COMPROBANTE) as TipoComprobante[]).find(
    (t) => TIPOS_COMPROBANTE[t].letra === letra && TIPOS_COMPROBANTE[t].clase === clase,
  );
  if (!encontrado) throw new Error(`No existe comprobante ${clase} ${letra}.`);
  return encontrado;
}

export const CONDICION_IVA: Record<CondicionIva, { codigo: number; etiqueta: string }> = {
  RESPONSABLE_INSCRIPTO: { codigo: 1, etiqueta: 'IVA Responsable Inscripto' },
  EXENTO: { codigo: 4, etiqueta: 'IVA Sujeto Exento' },
  CONSUMIDOR_FINAL: { codigo: 5, etiqueta: 'Consumidor Final' },
  MONOTRIBUTO: { codigo: 6, etiqueta: 'Responsable Monotributo' },
  NO_CATEGORIZADO: { codigo: 7, etiqueta: 'Sujeto No Categorizado' },
  PROVEEDOR_EXTERIOR: { codigo: 8, etiqueta: 'Proveedor del Exterior' },
  CLIENTE_EXTERIOR: { codigo: 9, etiqueta: 'Cliente del Exterior' },
  IVA_LIBERADO: { codigo: 10, etiqueta: 'IVA Liberado – Ley 19.640' },
  MONOTRIBUTO_SOCIAL: { codigo: 13, etiqueta: 'Monotributista Social' },
  NO_ALCANZADO: { codigo: 15, etiqueta: 'IVA No Alcanzado' },
  MONOTRIBUTO_TIP: { codigo: 16, etiqueta: 'Monotributo Trabajador Independiente Promovido' },
};

export const TIPO_DOCUMENTO: Record<TipoDocumento, { codigo: number; etiqueta: string }> = {
  CUIT: { codigo: 80, etiqueta: 'CUIT' },
  CUIL: { codigo: 86, etiqueta: 'CUIL' },
  DNI: { codigo: 96, etiqueta: 'DNI' },
  PASAPORTE: { codigo: 94, etiqueta: 'Pasaporte' },
  CONSUMIDOR_FINAL: { codigo: 99, etiqueta: 'Sin identificar' },
};

export const CONCEPTO: Record<ConceptoArca, { codigo: 1 | 2 | 3; etiqueta: string }> = {
  PRODUCTOS: { codigo: 1, etiqueta: 'Productos' },
  SERVICIOS: { codigo: 2, etiqueta: 'Servicios' },
  PRODUCTOS_Y_SERVICIOS: { codigo: 3, etiqueta: 'Productos y servicios' },
};

export const MONEDA_ARCA: Record<Moneda, 'PES' | 'DOL'> = { ARS: 'PES', USD: 'DOL' };

/** Alícuotas de IVA admitidas por WSFEv1 → AlicIva.Id. */
export const ALICUOTAS_IVA: Record<string, number> = {
  '0': 3,
  '2.5': 9,
  '5': 8,
  '10.5': 4,
  '21': 5,
  '27': 6,
};

export function esCondicionMonotributo(c: CondicionIva): boolean {
  return c === 'MONOTRIBUTO' || c === 'MONOTRIBUTO_SOCIAL' || c === 'MONOTRIBUTO_TIP';
}
