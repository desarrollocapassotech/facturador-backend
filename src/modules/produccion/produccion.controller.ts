import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';
import { CurrentAuth, type AuthContext } from '../auth';
import { ProduccionService } from './produccion.service';

export class ConfirmarAmbienteDto {
  /** El CUIT de la empresa, escrito a mano, como confirmación. */
  @IsString()
  @MaxLength(20)
  cuit: string;
}

@ApiExcludeController()
@Controller('configuracion/produccion')
export class ProduccionController {
  constructor(private readonly produccion: ProduccionService) {}

  @Get()
  estado(@CurrentAuth() auth: AuthContext) {
    return this.produccion.estado(auth.tenantId);
  }

  @Post('probar')
  @HttpCode(200)
  probar(@CurrentAuth() auth: AuthContext) {
    return this.produccion.probarConexion(auth.tenantId);
  }

  @Post('activar')
  @HttpCode(200)
  activar(@CurrentAuth() auth: AuthContext, @Body() dto: ConfirmarAmbienteDto) {
    return this.produccion.activar(auth, dto.cuit);
  }

  @Post('volver-a-homologacion')
  @HttpCode(200)
  volver(@CurrentAuth() auth: AuthContext, @Body() dto: ConfirmarAmbienteDto) {
    return this.produccion.volverAHomologacion(auth, dto.cuit);
  }
}
