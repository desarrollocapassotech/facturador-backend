-- CreateEnum
CREATE TYPE "OrigenItem" AS ENUM ('TRACKER', 'API', 'EXCEL', 'MANUAL');

-- CreateEnum
CREATE TYPE "EstadoItem" AS ENUM ('VALIDO', 'CON_ERRORES', 'DUPLICADO', 'EN_BORRADOR', 'FACTURADO', 'DESCARTADO');

-- CreateEnum
CREATE TYPE "EstadoImportacion" AS ENUM ('EN_STAGING', 'CONFIRMADA', 'DESCARTADA', 'FALLIDA');

-- AlterTable
ALTER TABLE "comprobante_lineas" ADD COLUMN     "itemFacturableId" TEXT;

-- CreateTable
CREATE TABLE "conexiones_tracker" (
    "tenantId" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "apiKeyCifrada" TEXT NOT NULL,
    "apiKeyPista" TEXT NOT NULL,
    "ultimaPruebaEn" TIMESTAMP(3),
    "ultimoError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conexiones_tracker_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "integraciones" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "origen" "OrigenItem" NOT NULL DEFAULT 'API',
    "keyPrefijo" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "scopes" TEXT[],
    "ultimoUsoEn" TIMESTAMP(3),
    "revocadaEn" TIMESTAMP(3),
    "creadaPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integraciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tokens_acceso" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "integracionId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "destino" TEXT,
    "expiraEn" TIMESTAMP(3) NOT NULL,
    "usadoEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tokens_acceso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clientes_referencias_externas" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "origen" "OrigenItem" NOT NULL,
    "referenciaExterna" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clientes_referencias_externas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tarifas" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "origen" "OrigenItem",
    "claveExterna" TEXT,
    "descripcion" TEXT,
    "unidad" "UnidadItem" NOT NULL,
    "precioUnitario" DECIMAL(15,4) NOT NULL,
    "moneda" "Moneda" NOT NULL,
    "alicuotaIva" DECIMAL(5,2) NOT NULL,
    "vigenteDesde" DATE NOT NULL,
    "vigenteHasta" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tarifas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plantillas_mapeo" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "formato" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plantillas_mapeo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "importaciones" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "origen" "OrigenItem" NOT NULL,
    "estado" "EstadoImportacion" NOT NULL DEFAULT 'EN_STAGING',
    "descripcion" TEXT,
    "archivoSha256" TEXT,
    "plantillaMapeoId" TEXT,
    "integracionId" TEXT,
    "parametros" JSONB,
    "advertencias" JSONB,
    "totalItems" INTEGER NOT NULL DEFAULT 0,
    "validos" INTEGER NOT NULL DEFAULT 0,
    "conErrores" INTEGER NOT NULL DEFAULT 0,
    "duplicados" INTEGER NOT NULL DEFAULT 0,
    "actualizados" INTEGER NOT NULL DEFAULT 0,
    "creadaPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmadaEn" TIMESTAMP(3),

    CONSTRAINT "importaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items_facturables" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "importacionId" TEXT,
    "origen" "OrigenItem" NOT NULL,
    "referenciaExterna" TEXT NOT NULL,
    "clienteId" TEXT,
    "clienteTipoDocumento" "TipoDocumento",
    "clienteNumeroDocumento" TEXT,
    "clienteReferenciaExterna" TEXT,
    "clienteAlta" JSONB,
    "descripcion" TEXT NOT NULL,
    "cantidad" DECIMAL(15,4) NOT NULL,
    "unidad" "UnidadItem" NOT NULL,
    "precioUnitario" DECIMAL(15,4) NOT NULL,
    "moneda" "Moneda" NOT NULL DEFAULT 'ARS',
    "alicuotaIva" DECIMAL(5,2) NOT NULL,
    "fecha" DATE,
    "periodoDesde" DATE,
    "periodoHasta" DATE,
    "metadatos" JSONB,
    "estado" "EstadoItem" NOT NULL DEFAULT 'VALIDO',
    "errores" JSONB,
    "hashContenido" TEXT NOT NULL,
    "comprobanteId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "items_facturables_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "integraciones_keyPrefijo_key" ON "integraciones"("keyPrefijo");

-- CreateIndex
CREATE INDEX "integraciones_tenantId_idx" ON "integraciones"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "integraciones_tenantId_id_key" ON "integraciones"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "tokens_acceso_tokenHash_key" ON "tokens_acceso"("tokenHash");

-- CreateIndex
CREATE INDEX "tokens_acceso_expiraEn_idx" ON "tokens_acceso"("expiraEn");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_referencias_externas_tenantId_origen_referenciaExt_key" ON "clientes_referencias_externas"("tenantId", "origen", "referenciaExterna");

-- CreateIndex
CREATE INDEX "tarifas_tenantId_clienteId_vigenteDesde_idx" ON "tarifas"("tenantId", "clienteId", "vigenteDesde");

-- CreateIndex
CREATE UNIQUE INDEX "plantillas_mapeo_tenantId_id_key" ON "plantillas_mapeo"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "plantillas_mapeo_tenantId_nombre_key" ON "plantillas_mapeo"("tenantId", "nombre");

-- CreateIndex
CREATE INDEX "importaciones_tenantId_createdAt_idx" ON "importaciones"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "importaciones_tenantId_id_key" ON "importaciones"("tenantId", "id");

-- CreateIndex
CREATE INDEX "items_facturables_tenantId_estado_idx" ON "items_facturables"("tenantId", "estado");

-- CreateIndex
CREATE INDEX "items_facturables_tenantId_clienteId_estado_idx" ON "items_facturables"("tenantId", "clienteId", "estado");

-- CreateIndex
CREATE INDEX "items_facturables_tenantId_importacionId_idx" ON "items_facturables"("tenantId", "importacionId");

-- CreateIndex
CREATE UNIQUE INDEX "items_facturables_tenantId_id_key" ON "items_facturables"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "items_facturables_tenantId_origen_referenciaExterna_key" ON "items_facturables"("tenantId", "origen", "referenciaExterna");

-- AddForeignKey
ALTER TABLE "conexiones_tracker" ADD CONSTRAINT "conexiones_tracker_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integraciones" ADD CONSTRAINT "integraciones_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tokens_acceso" ADD CONSTRAINT "tokens_acceso_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tokens_acceso" ADD CONSTRAINT "tokens_acceso_tenantId_integracionId_fkey" FOREIGN KEY ("tenantId", "integracionId") REFERENCES "integraciones"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tokens_acceso" ADD CONSTRAINT "tokens_acceso_tenantId_usuarioId_fkey" FOREIGN KEY ("tenantId", "usuarioId") REFERENCES "usuarios"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientes_referencias_externas" ADD CONSTRAINT "clientes_referencias_externas_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientes_referencias_externas" ADD CONSTRAINT "clientes_referencias_externas_tenantId_clienteId_fkey" FOREIGN KEY ("tenantId", "clienteId") REFERENCES "clientes"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarifas" ADD CONSTRAINT "tarifas_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarifas" ADD CONSTRAINT "tarifas_tenantId_clienteId_fkey" FOREIGN KEY ("tenantId", "clienteId") REFERENCES "clientes"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plantillas_mapeo" ADD CONSTRAINT "plantillas_mapeo_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "importaciones" ADD CONSTRAINT "importaciones_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "importaciones" ADD CONSTRAINT "importaciones_tenantId_plantillaMapeoId_fkey" FOREIGN KEY ("tenantId", "plantillaMapeoId") REFERENCES "plantillas_mapeo"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items_facturables" ADD CONSTRAINT "items_facturables_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items_facturables" ADD CONSTRAINT "items_facturables_tenantId_importacionId_fkey" FOREIGN KEY ("tenantId", "importacionId") REFERENCES "importaciones"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items_facturables" ADD CONSTRAINT "items_facturables_tenantId_clienteId_fkey" FOREIGN KEY ("tenantId", "clienteId") REFERENCES "clientes"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items_facturables" ADD CONSTRAINT "items_facturables_tenantId_comprobanteId_fkey" FOREIGN KEY ("tenantId", "comprobanteId") REFERENCES "comprobantes"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprobante_lineas" ADD CONSTRAINT "comprobante_lineas_tenantId_itemFacturableId_fkey" FOREIGN KEY ("tenantId", "itemFacturableId") REFERENCES "items_facturables"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
