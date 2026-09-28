import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentAuth, type AuthContext } from '../auth';
import { ClientesService } from './clientes.service';
import { ActualizarClienteDto, CrearClienteDto, ListarClientesQuery } from './dto/clientes.dto';

@Controller('clientes')
export class ClientesController {
  constructor(private readonly clientes: ClientesService) {}

  @Get()
  listar(@CurrentAuth() auth: AuthContext, @Query() query: ListarClientesQuery) {
    return this.clientes.listar(auth.tenantId, query);
  }

  // Declarado antes de ':id' para que Nest no lo tome como un id.
  @Get('padron/:cuit')
  padron(@CurrentAuth() auth: AuthContext, @Param('cuit') cuit: string) {
    return this.clientes.consultarPadron(auth.tenantId, cuit);
  }

  @Get(':id')
  obtener(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    return this.clientes.obtener(auth.tenantId, id);
  }

  @Post()
  crear(@CurrentAuth() auth: AuthContext, @Body() dto: CrearClienteDto) {
    return this.clientes.crear(auth.tenantId, dto);
  }

  @Patch(':id')
  actualizar(@CurrentAuth() auth: AuthContext, @Param('id') id: string, @Body() dto: ActualizarClienteDto) {
    return this.clientes.actualizar(auth.tenantId, id, dto);
  }
}
