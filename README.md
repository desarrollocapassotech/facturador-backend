# facturador-backend

Backend del Facturador electrónico multi-tenant. NestJS 10 + Prisma 6 + PostgreSQL (Neon).
La arquitectura completa está en `../ARCHITECTURE.md`.

## Puesta en marcha

```bash
npm install                 # también corre prisma generate
cp .env.example .env        # completar DATABASE_URL, DIRECT_URL y JWT_SECRET
npx prisma migrate deploy   # aplica las migraciones
npm run start:dev           # http://localhost:3000/api
```

Base de datos: proyecto Neon `facturador`, ramas `develop` (desarrollo) y `production`.

## Crear tenants y usuarios

No hay registro público: los tenants y usuarios se crean por script.

```bash
npm run crear-tenant -- --slug capassotech --nombre "CapassoTech" \
  --razon-social "Capasso Tech SAS" --cuit 30-12345678-9 \
  --condicion-iva RESPONSABLE_INSCRIPTO --domicilio "Calle 123, CABA"

# La contraseña se toma de NUEVA_PASSWORD; si no está, se genera y se muestra una vez.
NUEVA_PASSWORD='una-clave-larga' npm run crear-usuario -- --tenant capassotech --email persona@empresa.com
```

Volver a correr `crear-usuario` con un email existente le asigna la contraseña nueva y cierra todas sus sesiones.

## Endpoints (Fase 1)

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/api/health` | pública | Estado del servidor y de la base |
| POST | `/api/auth/login` | pública (5 intentos/min por IP) | `{ email, password, tenantSlug? }` → `{ accessToken, usuario, tenant }`. `409` con `tenants[]` si el email existe en varias empresas |
| GET | `/api/auth/me` | Bearer | Usuario y tenant de la sesión |

## Auth

- Todo endpoint requiere sesión salvo los marcados con `@Public()` (guard global en `modules/auth`).
- Los demás módulos solo usan `@CurrentAuth(): AuthContext` y lo exportado en `modules/auth/index.ts`, para poder reemplazar la autenticación por Clerk sin tocarlos.
- JWT HS256 (8 h). La sesión se revoca incrementando `Usuario.tokenVersion`.

## Scripts

| Script | Qué hace |
|---|---|
| `npm run typecheck` / `lint` / `test` | Lo mismo que corre el CI |
| `npm run prisma:migrate -- --name <nombre>` | Crea una migración nueva (rama `develop`) |
| `npm run prisma:deploy` | Aplica migraciones (producción) |
