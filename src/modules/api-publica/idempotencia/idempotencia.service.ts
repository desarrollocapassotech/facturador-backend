import { ConflictException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../../../shared/prisma/prisma.service';

export const VIGENCIA_MS = 24 * 3_600_000;

export type Inicio = { tipo: 'nueva'; id: string } | { tipo: 'repetida'; estadoHttp: number; respuesta: unknown };

export function hashSolicitud(metodo: string, ruta: string, cuerpo: unknown): string {
  return createHash('sha256').update(`${metodo} ${ruta}\n${JSON.stringify(cuerpo ?? null)}`).digest('hex');
}

/** Respuestas guardadas por Idempotency-Key (ARCHITECTURE.md §9): mismo request = misma respuesta. */
@Injectable()
export class IdempotenciaService {
  constructor(private readonly prisma: PrismaService) {}

  async iniciar(tenantId: string, integracionId: string, clave: string, hashRequest: string): Promise<Inicio> {
    const where = { tenantId_integracionId_clave: { tenantId, integracionId, clave } };
    for (let intento = 0; intento < 2; intento++) {
      const previa = await this.prisma.solicitudIdempotente.findUnique({ where });
      if (previa && previa.expiraEn < new Date()) {
        await this.prisma.solicitudIdempotente.deleteMany({ where: { id: previa.id } });
      } else if (previa) {
        if (previa.hashRequest !== hashRequest) {
          throw new UnprocessableEntityException('Esa Idempotency-Key ya se usó con otro request. Usá una clave nueva para cada operación.');
        }
        if (previa.estadoHttp === null) throw new ConflictException('Hay un request con esa Idempotency-Key en curso. Reintentá en unos segundos.');
        return { tipo: 'repetida', estadoHttp: previa.estadoHttp, respuesta: previa.respuesta };
      }
      try {
        const nueva = await this.prisma.solicitudIdempotente.create({
          data: { tenantId, integracionId, clave, hashRequest, expiraEn: new Date(Date.now() + VIGENCIA_MS) },
        });
        return { tipo: 'nueva', id: nueva.id };
      } catch (err) {
        // Otro request con la misma clave entró justo antes: se vuelve a leer.
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
      }
    }
    throw new ConflictException('Hay un request con esa Idempotency-Key en curso. Reintentá en unos segundos.');
  }

  async completar(id: string, estadoHttp: number, respuesta: unknown) {
    await this.prisma.solicitudIdempotente.update({
      where: { id },
      data: { estadoHttp, respuesta: (respuesta ?? null) as Prisma.InputJsonValue },
    });
  }

  /** Errores del servidor no se guardan: el cliente tiene que poder reintentar con la misma clave. */
  async descartar(id: string) {
    await this.prisma.solicitudIdempotente.deleteMany({ where: { id } });
  }

  @Cron(CronExpression.EVERY_HOUR)
  async limpiarVencidas() {
    await this.prisma.solicitudIdempotente.deleteMany({ where: { expiraEn: { lt: new Date() } } });
  }
}
