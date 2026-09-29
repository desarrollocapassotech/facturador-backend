import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';

const DESCRIPCION = `
API para que otros sistemas carguen lo que hay que facturar, generen borradores, emitan en ARCA y reciban avisos.

## Autenticación
Header \`X-Api-Key: fct_…\`. Las claves se crean en **Configuración → Integraciones**, con estos permisos:
\`items:write\` (cargar ítems y clientes), \`comprobantes:write\` (borradores y emisión), \`comprobantes:read\` (consultar y PDF)
y \`acceso:emitir\` (token de acceso sin doble login). Las rutas de la API no aceptan la sesión de un usuario.

## Idempotencia
Los \`POST\` aceptan \`Idempotency-Key\` (8 a 100 caracteres: letras, números, \`-\` o \`_\`). Con la misma clave y el mismo
request se devuelve la misma respuesta durante 24 h (header \`Idempotent-Replayed: true\`); con otro request, \`422\`;
si el primero sigue en curso, \`409\`. **Emitir la exige**: reintentar con la misma clave nunca emite dos veces.

Además, los ítems son idempotentes por \`referenciaExterna\`: reenviar uno igual no lo duplica.

## Flujo típico
1. \`POST /api/v1/items\` con \`confirmar: true\`.
2. \`POST /api/v1/comprobantes/borradores\` con tus \`referencias\`.
3. \`POST /api/v1/comprobantes/{id}/emitir\` con \`Idempotency-Key\`.
4. Recibís \`comprobante.emitido\` (o \`comprobante.rechazado\`) por webhook, y \`GET …/pdf\`.

## Webhooks
Se configuran en **Configuración → Webhooks**. Eventos: \`comprobante.emitido\`, \`comprobante.rechazado\`,
\`importacion.confirmada\`. Cada entrega es un \`POST\` JSON:

\`\`\`json
{ "id": "evt_…", "evento": "comprobante.emitido", "creadoEn": "2026-09-29T12:00:00.000Z",
  "datos": { "comprobante": { … }, "items": [{ "id": "…", "origen": "API", "referenciaExterna": "…" }] } }
\`\`\`

Headers: \`X-Facturador-Evento\`, \`X-Facturador-Evento-Id\` (usalo para deduplicar: puede llegar más de una vez) y
\`X-Facturador-Firma: t=<unix>,v1=<hex>\`, con \`v1 = HMAC_SHA256(secreto, t + "." + cuerpo_crudo)\`.
Respondé \`2xx\` en menos de 10 s. Si no, se reintenta a los 1 m, 5 m, 30 m, 2 h y 12 h (6 intentos).

Verificación en Node:
\`\`\`js
const { createHmac, timingSafeEqual } = require('crypto');
function valido(secreto, cuerpoCrudo, cabecera) {
  const { t, v1 } = Object.fromEntries(cabecera.split(',').map((p) => p.split('=')));
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false; // evita replays
  const esperado = createHmac('sha256', secreto).update(t + '.' + cuerpoCrudo).digest();
  return esperado.length === 32 && timingSafeEqual(esperado, Buffer.from(v1, 'hex'));
}
\`\`\`

## Ambiente
Mientras la empresa esté en **homologación**, los comprobantes no tienen validez fiscal (campo \`ambiente\`).
`;

/** Documento OpenAPI de la API pública: solo las rutas /api/v1. */
export function documentoOpenApi(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Facturador — API pública')
    .setDescription(DESCRIPCION)
    .setVersion('1.0')
    .addApiKey({ type: 'apiKey', in: 'header', name: 'X-Api-Key', description: 'API key de la integración (fct_…).' }, 'api-key')
    .build();
  const documento = SwaggerModule.createDocument(app, config);
  documento.paths = Object.fromEntries(Object.entries(documento.paths).filter(([ruta]) => ruta.startsWith('/api/v1/')));
  // Solo los modelos que usan esas rutas (sin DTOs internos de la app).
  const esquemas = documento.components?.schemas ?? {};
  const usados = new Set<string>();
  const recorrer = (nodo: unknown) => {
    if (!nodo || typeof nodo !== 'object') return;
    for (const [k, v] of Object.entries(nodo)) {
      if (k === '$ref' && typeof v === 'string') {
        const nombre = v.split('/').pop() as string;
        if (!usados.has(nombre)) {
          usados.add(nombre);
          recorrer(esquemas[nombre]);
        }
      } else recorrer(v);
    }
  };
  recorrer(documento.paths);
  if (documento.components) documento.components.schemas = Object.fromEntries(Object.entries(esquemas).filter(([n]) => usados.has(n)));
  return documento;
}

export function configurarSwagger(app: INestApplication) {
  SwaggerModule.setup('api/docs', app, documentoOpenApi(app), {
    customSiteTitle: 'Facturador — API',
    swaggerOptions: { persistAuthorization: false, docExpansion: 'list', defaultModelsExpandDepth: 0 },
    jsonDocumentUrl: 'api/docs/openapi.json',
  });
}
