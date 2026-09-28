import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentAuth, type AuthContext } from '../auth';
import { ActualizarTarifaDto, CrearTarifaDto } from './dto/tarifas.dto';
import { TarifasService } from './tarifas.service';

@Controller('configuracion/tarifas')
export class TarifasController {
  constructor(private readonly tarifas: TarifasService) {}

  @Get()
  listar(@CurrentAuth() auth: AuthContext, @Query('clienteId') clienteId?: string) {
    return this.tarifas.listar(auth.tenantId, clienteId || undefined);
  }

  @Post()
  crear(@CurrentAuth() auth: AuthContext, @Body() dto: CrearTarifaDto) {
    return this.tarifas.crear(auth.tenantId, dto);
  }

  @Patch(':id')
  actualizar(@CurrentAuth() auth: AuthContext, @Param('id') id: string, @Body() dto: ActualizarTarifaDto) {
    return this.tarifas.actualizar(auth.tenantId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  eliminar(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    return this.tarifas.eliminar(auth.tenantId, id);
  }
}
