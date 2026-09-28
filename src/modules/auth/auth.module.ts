import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AccesoService } from './acceso.service';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { AccesoController, IntegracionesController } from './integraciones.controller';
import { IntegracionesService } from './integraciones.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { algorithm: 'HS256', expiresIn: config.getOrThrow<string>('JWT_EXPIRES_IN') },
      }),
    }),
  ],
  controllers: [AuthController, IntegracionesController, AccesoController],
  providers: [AuthService, IntegracionesService, AccesoService, { provide: APP_GUARD, useClass: AuthGuard }],
})
export class AuthModule {}
