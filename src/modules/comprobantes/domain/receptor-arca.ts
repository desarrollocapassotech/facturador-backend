import type { CondicionIva, TipoDocumento } from '@prisma/client';
import { CONDICION_IVA, TIPO_DOCUMENTO, type Letra } from './codigos';

/** CUIT receptor de prueba en homologación (está en el padrón del entorno de pruebas; ver Vialto arca.util.ts). */
export const CUIT_RECEPTOR_PRUEBA = 30668346908;

export interface ReceptorArca {
  docTipo: number;
  docNro: number;
  condicionIvaReceptorId: number;
}

/**
 * DocTipo / DocNro / CondicionIVAReceptorId a informar.
 * Con el CUIT de prueba de AfipSDK, ARCA no conoce los clientes reales: se usan receptores de
 * prueba (clase A → CUIT de prueba RI; B y C → consumidor final), igual que Vialto.
 */
export function resolverReceptorArca(
  usaCuitPrueba: boolean,
  letra: Letra,
  cliente: { tipoDocumento: TipoDocumento; numeroDocumento: string; condicionIva: CondicionIva },
): ReceptorArca {
  if (usaCuitPrueba) {
    return letra === 'A'
      ? { docTipo: 80, docNro: CUIT_RECEPTOR_PRUEBA, condicionIvaReceptorId: 1 }
      : { docTipo: 99, docNro: 0, condicionIvaReceptorId: 5 };
  }
  if (cliente.tipoDocumento === 'CONSUMIDOR_FINAL') {
    return { docTipo: 99, docNro: 0, condicionIvaReceptorId: CONDICION_IVA[cliente.condicionIva].codigo };
  }
  const docNro = Number(cliente.numeroDocumento);
  if (!Number.isSafeInteger(docNro)) {
    throw new Error('ARCA solo acepta documentos numéricos: revisá el documento del cliente.');
  }
  return {
    docTipo: TIPO_DOCUMENTO[cliente.tipoDocumento].codigo,
    docNro,
    condicionIvaReceptorId: CONDICION_IVA[cliente.condicionIva].codigo,
  };
}
