/**
 * Exporta la documentación de la API pública a docs/openapi.json (se versiona en el repo).
 * Uso: npm run openapi. Corre en modo preview: no se conecta a la base ni arranca crons.
 * Se compila con el plugin de Swagger (nest build), por eso vive en src/ y corre desde dist/.
 */
import { NestFactory } from '@nestjs/core';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { AppModule } from './app.module';
import { documentoOpenApi } from './swagger';

async function main() {
  const app = await NestFactory.create(AppModule, { preview: true, logger: false });
  app.setGlobalPrefix('api');
  const documento = documentoOpenApi(app);
  const destino = join(process.cwd(), 'docs', 'openapi.json');
  mkdirSync(join(process.cwd(), 'docs'), { recursive: true });
  writeFileSync(destino, `${JSON.stringify(documento, null, 2)}\n`);
  console.log(`${Object.keys(documento.paths).length} rutas → ${destino}`);
  await app.close();
}

void main();
