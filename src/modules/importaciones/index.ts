// API pública del módulo importaciones: `comprobantes` usa ItemsFacturablesService;
// `api-publica` usa ImportacionesService para el ingreso por API.
export { ImportacionesModule } from './importaciones.module';
export { ImportacionesService } from './importaciones.service';
export { ItemsFacturablesService } from './items-facturables.service';
export type { ItemFacturableInput } from './domain/item-facturable';
