# Pase a producción

Guía para poner el Facturador en producción y emitir la primera factura real con un tenant piloto.
Los pasos marcados **(ARCA)** o **(Render/Neon)** se hacen fuera del código, con las credenciales del dueño.

## 0. Antes de salir

- [ ] **Actualizar NestJS 10 → 12.** `npm audit --omit=dev` marca vulnerabilidades altas que solo se resuelven así:
  `multer` (DoS en subida de archivos), `lodash` y `js-yaml` (prototype pollution), `body-parser`. Hacerlo en una rama y
  correr `npm test`, `npm run deps` y la prueba de punta a punta de `PLAN.md`.
- [ ] Guardar **`FACTURADOR_ENCRYPTION_KEY` de producción** en un gestor de secretos. Si se pierde, los certificados
  guardados no se pueden descifrar (hay que volver a cargarlos).
- [ ] Revisar el costo de AfipSDK para producción (el uso de todos los tenants sale de la misma `AFIP_SDK_API_KEY`).

## 1. Base de datos (Render/Neon)

Proyecto Neon `facturador`, rama `production`.

1. Copiar las connection strings de la rama `production` (con pooler para `DATABASE_URL`, sin pooler para `DIRECT_URL`).
2. Aplicar las migraciones: `DATABASE_URL=… DIRECT_URL=… npx prisma migrate deploy`. El build de Render también lo hace
   (`render.yaml`).

## 2. Backend y frontend (Render)

`render.yaml` está en cada repo (región Ohio, plan free, rama `main`). Crear los servicios desde el Blueprint y cargar:

| Variable (backend) | Valor |
|---|---|
| `DATABASE_URL`, `DIRECT_URL` | Neon `production` |
| `JWT_SECRET` | la genera Render |
| `FACTURADOR_ENCRYPTION_KEY` | 32+ caracteres aleatorios; **no se cambia nunca** |
| `AFIP_SDK_API_KEY` | token de AfipSDK |
| `FRONTEND_URL` | URL del static site (CORS y enlaces de acceso) |
| `NODE_ENV` | `production` (ya está en `render.yaml`: exige https en webhooks y tracker, y bloquea IPs internas) |

| Variable (frontend) | Valor |
|---|---|
| `VITE_API_URL` | URL del backend + `/api` |

Verificar: `GET /api/health` responde y `/api/docs` muestra la documentación.

## 3. Tenant piloto y usuario

```bash
DATABASE_URL=… npm run crear-tenant -- --slug <slug> --nombre "<Nombre>" \
  --razon-social "<Razón social>" --cuit <CUIT> --condicion-iva RESPONSABLE_INSCRIPTO --domicilio "<Domicilio fiscal>"
DATABASE_URL=… NUEVA_PASSWORD='<clave larga>' npm run crear-usuario -- --tenant <slug> --email <email>
```

El tenant arranca en **homologación**. Entrar, completar Configuración → Datos del emisor (inicio de actividades,
ingresos brutos) y hacer una factura de prueba en homologación.

## 4. Certificado de producción (ARCA)

Con la clave fiscal del CUIT emisor:

1. Generar la clave privada y el pedido de certificado (CSR). La clave privada **no se comparte** con nadie:
   ```bash
   openssl genrsa -out facturador.key 2048
   openssl req -new -key facturador.key -subj "/C=AR/O=<Razón social>/CN=facturador/serialNumber=CUIT <CUIT sin guiones>" -out facturador.csr
   ```
2. ARCA → **Administración de Certificados Digitales** → agregar alias `facturador` → subir `facturador.csr` →
   descargar el certificado (`.crt`).
3. ARCA → **Administrador de Relaciones de Clave Fiscal** → nueva relación → servicio **Facturación Electrónica**
   (`wsfe`) → representante: el certificado `facturador`.
4. ARCA → **Administración de Puntos de Venta y Domicilios** → alta de un punto de venta **RECE / Factura
   Electrónica - Monotributo / Responsable Inscripto Web Services** (no sirve uno de "Comprobantes en línea").

## 5. Configuración en el Facturador

1. Configuración → **Certificados ARCA** → ambiente **Producción** → pegar o subir `facturador.crt` y `facturador.key`.
   Se valida que sean pareja, que no estén vencidos y que el CUIT coincida; se guardan cifrados.
2. Configuración → **Puntos de venta** → agregar el número del paso 4.4 con ambiente **Producción**.
3. Configuración → **Producción** → **Probar conexión con ARCA producción**. Solo consulta el último número autorizado
   (no emite). Tiene que responder "conexión correcta" en cada punto de venta.
4. **Pasar a producción**, escribiendo el CUIT para confirmar. Antes de cambiar se vuelve a probar la conexión.

## 6. Primera factura real

- Elegir un cliente conocido y un importe chico. Revisar el borrador (letra, concepto, fechas de servicio) antes de emitir.
- Emitir. Controlar el CAE en ARCA (**Mis Comprobantes**) y descargar el PDF (el QR tiene que abrir el comprobante en ARCA).
- Si hubo que anularla: nota de crédito por el total desde el comprobante (la factura queda ANULADA).

## 7. Integraciones del piloto (si aplica)

- **Tracker**: en el backend del tracker de producción, `FACTURADOR_INTEGRATION_KEY_HASH` (desde Configuración → Tracker →
  Generar), `FACTURADOR_API_URL` (URL del backend + `/api`) y `FACTURADOR_API_KEY` (Configuración → Integraciones, permiso
  "acceso"). La URL del tracker tiene que ser https.
- **Webhooks**: solo https y a direcciones públicas.

## Volver a homologación

Configuración → Producción → **Volver a homologación** (con el CUIT). Los comprobantes ya emitidos en producción siguen
siendo válidos.
