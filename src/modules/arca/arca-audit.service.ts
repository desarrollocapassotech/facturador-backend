import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import type { AmbienteArca } from './arca.types';

export interface RegistroArca {
  tenantId: string;
  comprobanteId?: string;
  metodo: string;
  ambiente: AmbienteArca;
  request: unknown; // ya saneado: nunca token/sign/cert/clave
  response?: unknown;
  exitoso: boolean;
  error?: string;
  duracionMs: number;
}

/** Persiste ArcaLog. Un fallo al auditar nunca debe romper una emisión. */
@Injectable()
export class ArcaAuditService {
  private readonly logger = new Logger(ArcaAuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async registrar(r: RegistroArca): Promise<void> {
    try {
      await this.prisma.arcaLog.create({
        data: {
          tenantId: r.tenantId,
          comprobanteId: r.comprobanteId ?? null,
          metodo: r.metodo,
          ambiente: r.ambiente,
          request: (r.request ?? {}) as Prisma.InputJsonValue,
          response: r.response === undefined ? Prisma.JsonNull : (r.response as Prisma.InputJsonValue),
          exitoso: r.exitoso,
          error: r.error ?? null,
          duracionMs: r.duracionMs,
        },
      });
    } catch (err) {
      this.logger.error(`No se pudo guardar ArcaLog (${r.metodo}): ${(err as Error).message}`);
    }
  }
}
