import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { catchError, from, mergeMap, Observable, of, throwError } from 'rxjs';
import type { AuthContext } from '../../auth';
import { hashSolicitud, IdempotenciaService } from './idempotencia.service';

export const IDEMPOTENTE = 'api:idempotente';
const CLAVE = /^[A-Za-z0-9_-]{8,100}$/;

/**
 * POST idempotente por header `Idempotency-Key`: con la misma clave y el mismo request se
 * devuelve la respuesta guardada (24 h). `obligatoria` para operaciones que no se pueden repetir.
 */
export const Idempotente = (opciones: { obligatoria?: boolean } = {}) => SetMetadata(IDEMPOTENTE, opciones);

@Injectable()
export class IdempotenciaInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly servicio: IdempotenciaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const opciones = this.reflector.get<{ obligatoria?: boolean } | undefined>(IDEMPOTENTE, context.getHandler());
    if (!opciones) return next.handle();

    const req = context.switchToHttp().getRequest<Request & { auth?: AuthContext }>();
    const res = context.switchToHttp().getResponse<Response>();
    const clave = req.headers['idempotency-key'];
    if (typeof clave !== 'string' || !clave) {
      if (opciones.obligatoria) throw new BadRequestException('Falta el header Idempotency-Key (8 a 100 caracteres: letras, números, - o _).');
      return next.handle();
    }
    if (!CLAVE.test(clave)) throw new BadRequestException('Idempotency-Key inválida: 8 a 100 caracteres (letras, números, - o _).');
    const auth = req.auth;
    if (!auth?.integracionId) return next.handle();

    const hash = hashSolicitud(req.method, req.originalUrl, req.body);
    return from(this.servicio.iniciar(auth.tenantId, auth.integracionId, clave, hash)).pipe(
      mergeMap((inicio) => {
        if (inicio.tipo === 'repetida') {
          res.setHeader('Idempotent-Replayed', 'true');
          if (inicio.estadoHttp >= 400) {
            return throwError(() => new HttpException(inicio.respuesta as Record<string, unknown>, inicio.estadoHttp));
          }
          res.status(inicio.estadoHttp);
          return of(inicio.respuesta);
        }
        return next.handle().pipe(
          mergeMap((cuerpo) => from(this.servicio.completar(inicio.id, res.statusCode, cuerpo).then(() => cuerpo))),
          catchError((err: unknown) => {
            const guardar =
              err instanceof HttpException && err.getStatus() < 500
                ? this.servicio.completar(inicio.id, err.getStatus(), err.getResponse())
                : this.servicio.descartar(inicio.id);
            return from(guardar).pipe(mergeMap(() => throwError(() => err)));
          }),
        );
      }),
    );
  }
}
