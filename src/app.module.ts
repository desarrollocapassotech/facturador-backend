import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { HealthController } from './health.controller';
import { AuthModule } from './modules/auth';
import { ClientesModule } from './modules/clientes';
import { ComprobantesModule } from './modules/comprobantes';
import { RecibosModule } from './modules/recibos';
import { TenantsModule } from './modules/tenants';
import { validateEnv } from './shared/config/env.validation';
import { PrismaModule } from './shared/prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    // Límite por defecto generoso; el login define uno propio más estricto.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    TenantsModule,
    ClientesModule,
    ComprobantesModule,
    RecibosModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
