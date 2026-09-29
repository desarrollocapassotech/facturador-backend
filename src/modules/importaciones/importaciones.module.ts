import { Module } from '@nestjs/common';
import { ClientesModule } from '../clientes';
import { TenantsModule } from '../tenants';
import { ExcelCsvAdapter } from './adapters/excel/excel.adapter';
import { PlantillasMapeoService } from './adapters/excel/plantillas-mapeo.service';
import { ConexionTrackerService } from './adapters/tracker/conexion-tracker.service';
import { TrackerAdapter } from './adapters/tracker/tracker.adapter';
import { TrackerClient } from './adapters/tracker/tracker-client';
import { ConfiguracionImportacionesController, ImportacionesController } from './importaciones.controller';
import { ImportacionesService } from './importaciones.service';
import { ItemsFacturablesService } from './items-facturables.service';
import { StagingService } from './staging.service';

@Module({
  imports: [ClientesModule, TenantsModule],
  controllers: [ImportacionesController, ConfiguracionImportacionesController],
  providers: [
    StagingService,
    ImportacionesService,
    ItemsFacturablesService,
    PlantillasMapeoService,
    ConexionTrackerService,
    TrackerClient,
    TrackerAdapter,
    ExcelCsvAdapter,
  ],
  exports: [ItemsFacturablesService, ImportacionesService],
})
export class ImportacionesModule {}
