import { Module } from '@nestjs/common';
import { TenantsModule } from '../tenants';
import { RecibosController } from './recibos.controller';
import { RecibosService } from './recibos.service';

@Module({
  imports: [TenantsModule],
  controllers: [RecibosController],
  providers: [RecibosService],
  exports: [RecibosService],
})
export class RecibosModule {}
