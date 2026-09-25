import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthContext } from './auth-context';
import { AuthService } from './auth.service';
import { IS_PUBLIC_KEY } from './decorators';

/**
 * Guard global: toda ruta requiere sesión salvo las marcadas con @Public().
 * En la Fase 4 suma la rama de API key por integración (@ApiKey).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request & { auth?: AuthContext }>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Falta la sesión.');
    }

    request.auth = await this.authService.validarSesion(header.slice('Bearer '.length).trim());
    return true;
  }
}
