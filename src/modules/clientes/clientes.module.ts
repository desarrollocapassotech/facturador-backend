import { Module } from '@nestjs/common';
import { ArcaModule } from '../arca';
import { TenantsModule } from '../tenants';
import { ClientesController } from './clientes.controller';
import { ClientesService } from './clientes.service';

@Module({
  imports: [TenantsModule, ArcaModule],
  controllers: [ClientesController],
  providers: [ClientesService],
  exports: [ClientesService],
})
export class ClientesModule {}
