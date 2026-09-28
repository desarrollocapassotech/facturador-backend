import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { AuthContext } from './auth-context';
import type { Scope } from './claves';

export const IS_PUBLIC_KEY = 'auth:isPublic';
export const API_KEY_SCOPES = 'auth:apiKeyScopes';

/** Marca una ruta como accesible sin sesión (el guard global la deja pasar). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Ruta para sistemas integrados: exige `X-Api-Key` con TODOS los scopes indicados y
 * no acepta la sesión de un usuario (ARCHITECTURE.md §8.1).
 */
export const ApiKey = (...scopes: Scope[]) => SetMetadata(API_KEY_SCOPES, scopes);

/** Inyecta el AuthContext armado por el guard. */
export const CurrentAuth = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthContext =>
    ctx.switchToHttp().getRequest<{ auth: AuthContext }>().auth,
);
