import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configurarSwagger } from './swagger';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  // Render pone un proxy adelante: sin esto el rate limit del login ve a todos con la misma IP.
  app.set('trust proxy', 1);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.enableCors({
    // El navegador manda el origen sin barra final: "https://x.com/" en la variable no coincidiría nunca.
    origin: config
      .getOrThrow<string>('FRONTEND_URL')
      .split(',')
      .map((o) => o.trim().replace(/\/+$/, ''))
      .filter(Boolean),
  });
  app.enableShutdownHooks();
  configurarSwagger(app); // /api/docs (UI) y /api/docs/openapi.json

  const port = config.get<number>('PORT') ?? 3000;
  await app.listen(port);
  new Logger('Bootstrap').log(`Faktia backend escuchando en :${port}`);
}

void bootstrap();
