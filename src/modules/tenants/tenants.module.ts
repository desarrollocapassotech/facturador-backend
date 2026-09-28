import { Module } from '@nestjs/common';
import { CredencialesArcaProvider } from './credenciales-arca.provider';
import { TarifasController } from './tarifas.controller';
import { TarifasService } from './tarifas.service';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';

@Module({
  controllers: [TenantsController, TarifasController],
  providers: [TenantsService, CredencialesArcaProvider, TarifasService],
  exports: [TenantsService, CredencialesArcaProvider, TarifasService],
})
export class TenantsModule {}
