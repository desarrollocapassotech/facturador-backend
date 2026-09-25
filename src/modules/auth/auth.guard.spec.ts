import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from './auth.guard';
import type { AuthService } from './auth.service';

function contexto(headers: Record<string, string>, request: Record<string, unknown> = {}) {
  Object.assign(request, { headers });
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('AuthGuard', () => {
  const authService = {
    validarSesion: jest.fn(async (token: string) => {
      if (token !== 'ok') throw new UnauthorizedException();
      return { tenantId: 't1', tipo: 'usuario', usuarioId: 'u1', scopes: [] };
    }),
  } as unknown as AuthService;

  it('deja pasar rutas @Public() sin header', async () => {
    const reflector = { getAllAndOverride: () => true } as unknown as Reflector;
    await expect(new AuthGuard(reflector, authService).canActivate(contexto({}))).resolves.toBe(true);
  });

  it('exige Bearer en rutas protegidas', async () => {
    const reflector = { getAllAndOverride: () => false } as unknown as Reflector;
    await expect(new AuthGuard(reflector, authService).canActivate(contexto({}))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('carga el AuthContext en la request', async () => {
    const reflector = { getAllAndOverride: () => false } as unknown as Reflector;
    const request: Record<string, unknown> = {};
    await new AuthGuard(reflector, authService).canActivate(
      contexto({ authorization: 'Bearer ok' }, request),
    );
    expect(request.auth).toMatchObject({ tenantId: 't1', usuarioId: 'u1' });
  });
});
