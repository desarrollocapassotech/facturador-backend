// Eventos de dominio (ARCHITECTURE.md §4): los módulos los emiten con EventEmitter2 y
// `api-publica` los escucha para encolar webhooks. Así quien emite no conoce a quien escucha.

export const EVENTOS = {
  COMPROBANTE_EMITIDO: 'comprobante.emitido',
  COMPROBANTE_RECHAZADO: 'comprobante.rechazado',
  IMPORTACION_CONFIRMADA: 'importacion.confirmada',
} as const;

export type NombreEvento = (typeof EVENTOS)[keyof typeof EVENTOS];
export const NOMBRES_EVENTOS: NombreEvento[] = Object.values(EVENTOS);

export interface EventoComprobante {
  tenantId: string;
  comprobanteId: string;
  /** Distingue rechazos sucesivos del mismo comprobante (cada reintento es un evento nuevo). */
  intento?: number;
}

export interface EventoImportacion {
  tenantId: string;
  importacionId: string;
}
