import { Module } from '@nestjs/common';
import { ClientesModule } from '../clientes';
import { ComprobantesModule } from '../comprobantes';
import { ImportacionesModule } from '../importaciones';
import { TenantsModule } from '../tenants';
import { IdempotenciaInterceptor } from './idempotencia/idempotencia.interceptor';
import { IdempotenciaService } from './idempotencia/idempotencia.service';
import { V1Controller } from './v1.controller';
import { WebhooksController } from './webhooks/webhooks.controller';
import { WebhooksService } from './webhooks/webhooks.service';

/** API pública (/api/v1), idempotencia y webhooks salientes (ARCHITECTURE.md §4 y §8.5). */
@Module({
  imports: [ImportacionesModule, ComprobantesModule, ClientesModule, TenantsModule],
  controllers: [V1Controller, WebhooksController],
  providers: [IdempotenciaService, IdempotenciaInterceptor, WebhooksService],
})
export class ApiPublicaModule {}
