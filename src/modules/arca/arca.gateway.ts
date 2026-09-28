import type {
  CaeOtorgado,
  ComprobanteArca,
  CredencialesArca,
  DatosPadron,
  SolicitudCae,
} from './arca.types';

export const ARCA_GATEWAY = Symbol('ARCA_GATEWAY');

/** Contexto de auditoría: a qué tenant y comprobante corresponde cada llamada. */
export interface ContextoLlamada {
  comprobanteId?: string;
}

/**
 * Puerto hacia ARCA. La implementación actual es AfipSDK (afip-sdk.gateway.ts);
 * cambiar a WSAA/WSFE nativo solo requiere otra implementación de esta interfaz.
 * Todos los métodos lanzan ArcaError.
 */
export interface ArcaGateway {
  ultimoAutorizado(c: CredencialesArca, ptoVta: number, cbteTipo: number, ctx?: ContextoLlamada): Promise<number>;
  autorizar(c: CredencialesArca, solicitud: SolicitudCae, ctx?: ContextoLlamada): Promise<CaeOtorgado>;
  consultar(
    c: CredencialesArca,
    ptoVta: number,
    cbteTipo: number,
    numero: number,
    ctx?: ContextoLlamada,
  ): Promise<ComprobanteArca | null>;
  cotizacionDolar(c: CredencialesArca, ctx?: ContextoLlamada): Promise<string>;
  consultarPadron(c: CredencialesArca, cuit: string): Promise<DatosPadron | null>;
}
