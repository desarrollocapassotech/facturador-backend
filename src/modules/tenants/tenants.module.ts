import { Module } from '@nestjs/common';
import { CredencialesArcaProvider } from './credenciales-arca.provider';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';

@Module({
  controllers: [TenantsController],
  providers: [TenantsService, CredencialesArcaProvider],
  exports: [TenantsService, CredencialesArcaProvider],
})
export class TenantsModule {}
