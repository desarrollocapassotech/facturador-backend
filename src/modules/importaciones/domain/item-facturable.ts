// Modelo canónico de entrada (ARCHITECTURE.md §6): lo producen TODOS los adaptadores.

export type OrigenItem = 'TRACKER' | 'API' | 'EXCEL' | 'MANUAL';
export type UnidadItem = 'HORA' | 'UNIDAD' | 'SERVICIO' | 'MES';
export type TipoDocumentoRef = 'CUIT' | 'CUIL' | 'DNI' | 'PASAPORTE' | 'CONSUMIDOR_FINAL';

export interface AltaCliente {
  razonSocial: string;
  condicionIva?: string;
  domicilio?: string;
  email?: string;
}

export interface ClienteRef {
  /** Cliente ya existente en el Facturador. */
  clienteId?: string;
  /** O documento: se busca; si no existe, el ítem queda CON_ERRORES (con `alta` sugerida). */
  tipoDocumento?: TipoDocumentoRef;
  numeroDocumento?: string;
  /** O id en el sistema de origen (se resuelve con ClienteReferenciaExterna). */
  referenciaExterna?: string;
  /** Datos para crear el cliente si no existe. */
  alta?: AltaCliente;
}

export interface ItemFacturableInput {
  origen: OrigenItem;
  /** Id estable en el sistema de origen. (origen, referenciaExterna) es único por tenant. */
  referenciaExterna: string;
  cliente: ClienteRef;
  descripcion: string;
  cantidad: string; // decimal como string, nunca number
  unidad: UnidadItem;
  /** Sin IVA. Si falta, se toma de la tarifa vigente del cliente (y con ella moneda, alícuota y descripción). */
  precioUnitario?: string;
  moneda?: 'ARS' | 'USD';
  alicuotaIva?: string;
  fecha?: string; // YYYY-MM-DD
  periodo?: { desde: string; hasta: string };
  metadatos?: Record<string, unknown>;
}

/** Datos que el staging usa para buscar la tarifa cuando el ítem no trae precio. */
export interface PedidoTarifa {
  /** Clave específica de la tarifa (ej. id del proyecto en el tracker). */
  claveExterna?: string;
  /** Variables para la descripción de la tarifa: {proyecto}, {periodo}, … */
  variables?: Record<string, string>;
}

export interface ContextoFuente {
  tenantId: string;
  usuarioId?: string;
  integracionId?: string;
}

export interface Advertencia {
  referencia?: string;
  mensaje: string;
}

export interface ResultadoExtraccion {
  items: ItemFacturableInput[];
  advertencias: Advertencia[];
  descripcionLote: string;
  parametros?: Record<string, unknown>;
  archivoSha256?: string;
}

/** Puerto de fuente de datos (ARCHITECTURE.md §7.1). */
export interface FuenteDatosAdapter<TParams> {
  readonly origen: OrigenItem;
  extraer(ctx: ContextoFuente, params: TParams): Promise<ResultadoExtraccion>;
}

export const UNIDADES_SERVICIO: UnidadItem[] = ['HORA', 'SERVICIO', 'MES'];
export const ALICUOTAS = ['0', '2.5', '5', '10.5', '21', '27'];
