import { Injectable } from '@nestjs/common';
import type { AmbienteArca } from '@prisma/client';
import type { CredencialesArca } from '../arca';
import { CUIT_PRUEBA_AFIPSDK, TenantsService } from './tenants.service';

/**
 * Arma las credenciales ARCA del tenant para su ambiente actual.
 * - Producción: CUIT real + certificado (el gateway exige que exista).
 * - Homologación con certificado: CUIT real + certificado de homologación.
 * - Homologación sin certificado: CUIT de prueba de AfipSDK, sin certificado (como Vialto).
 */
@Injectable()
export class CredencialesArcaProvider {
  constructor(private readonly tenants: TenantsService) {}

  async obtener(tenantId: string): Promise<CredencialesArca> {
    const emisor = await this.tenants.obtenerEmisor(tenantId);
    return this.paraAmbiente(tenantId, emisor.ambienteArca);
  }

  /** Credenciales de un ambiente puntual (ej. probar producción antes de activarla). */
  async paraAmbiente(tenantId: string, ambiente: AmbienteArca): Promise<CredencialesArca> {
    const emisor = await this.tenants.obtenerEmisor(tenantId);
    const cert = await this.tenants.certificadoActivo(tenantId, ambiente);
    const usaCuitPrueba = ambiente === 'HOMOLOGACION' && !cert;
    return {
      tenantId,
      ambiente,
      cuit: usaCuitPrueba ? CUIT_PRUEBA_AFIPSDK : emisor.cuit,
      certPem: cert?.certPem ?? null,
      keyPem: cert?.keyPem ?? null,
      usaCuitPrueba,
    };
  }
}
