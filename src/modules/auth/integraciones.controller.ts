import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AccesoService } from './acceso.service';
import type { AuthContext } from './auth-context';
import { ApiKey, CurrentAuth, Public } from './decorators';
import { CanjearTokenDto, CrearIntegracionDto, EmitirTokenAccesoDto } from './dto/integraciones.dto';
import { IntegracionesService } from './integraciones.service';

/** Gestión de API keys (usuario logueado). */
@Controller('integraciones')
export class IntegracionesController {
  constructor(private readonly integraciones: IntegracionesService) {}

  @Get()
  listar(@CurrentAuth() auth: AuthContext) {
    return this.integraciones.listar(auth.tenantId);
  }

  /** Devuelve la clave completa una sola vez. */
  @Post()
  crear(@CurrentAuth() auth: AuthContext, @Body() dto: CrearIntegracionDto) {
    return this.integraciones.crear(auth, { nombre: dto.nombre, origen: dto.origen ?? 'API', scopes: dto.scopes });
  }

  @Delete(':id')
  revocar(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    return this.integraciones.revocar(auth.tenantId, id);
  }
}

/** Token de acceso: lo pide un backend integrado (API key) y lo canjea el navegador. */
@Controller()
export class AccesoController {
  constructor(private readonly acceso: AccesoService) {}

  @ApiKey('acceso:emitir')
  @Post('v1/acceso/tokens')
  emitir(@CurrentAuth() auth: AuthContext, @Body() dto: EmitirTokenAccesoDto) {
    return this.acceso.emitirToken(auth, dto);
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('auth/acceso/canjear')
  @HttpCode(200)
  canjear(@Body() dto: CanjearTokenDto) {
    return this.acceso.canjear(dto.token);
  }
}
