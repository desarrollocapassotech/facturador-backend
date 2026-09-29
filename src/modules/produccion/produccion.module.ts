import { Module } from '@nestjs/common';
import { ArcaModule } from '../arca';
import { TenantsModule } from '../tenants';
import { ProduccionController } from './produccion.controller';
import { ProduccionService } from './produccion.service';

/** Pase de un tenant de homologación a producción, con chequeo previo y prueba de conexión. */
@Module({
  imports: [TenantsModule, ArcaModule],
  controllers: [ProduccionController],
  providers: [ProduccionService],
})
export class ProduccionModule {}
