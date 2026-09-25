import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { AuthContext } from './auth-context';

export const IS_PUBLIC_KEY = 'auth:isPublic';

/** Marca una ruta como accesible sin sesión (el guard global la deja pasar). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Inyecta el AuthContext armado por el guard. */
export const CurrentAuth = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthContext =>
    ctx.switchToHttp().getRequest<{ auth: AuthContext }>().auth,
);
