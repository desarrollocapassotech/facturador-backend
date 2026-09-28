-- CreateEnum
CREATE TYPE "TipoDocumento" AS ENUM ('CUIT', 'CUIL', 'DNI', 'PASAPORTE', 'CONSUMIDOR_FINAL');

-- CreateEnum
CREATE TYPE "TipoComprobante" AS ENUM ('FACTURA_A', 'NOTA_DEBITO_A', 'NOTA_CREDITO_A', 'FACTURA_B', 'NOTA_DEBITO_B', 'NOTA_CREDITO_B', 'FACTURA_C', 'NOTA_DEBITO_C', 'NOTA_CREDITO_C');

-- CreateEnum
CREATE TYPE "ConceptoArca" AS ENUM ('PRODUCTOS', 'SERVICIOS', 'PRODUCTOS_Y_SERVICIOS');

-- CreateEnum
CREATE TYPE "Moneda" AS ENUM ('ARS', 'USD');

-- CreateEnum
CREATE TYPE "EstadoComprobante" AS ENUM ('BORRADOR', 'EMITIENDO', 'PENDIENTE_VERIFICACION', 'EMITIDO', 'RECHAZADO', 'ANULADO');

-- CreateEnum
CREATE TYPE "UnidadItem" AS ENUM ('HORA', 'UNIDAD', 'SERVICIO', 'MES');

-- CreateTable
CREATE TABLE "puntos_venta" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "ambiente" "AmbienteArca" NOT NULL,
    "descripcion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "puntos_venta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificados_arca" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ambiente" "AmbienteArca" NOT NULL,
    "certCifrado" TEXT NOT NULL,
    "claveCifrada" TEXT NOT NULL,
    "alias" TEXT,
    "huellaSha256" TEXT NOT NULL,
    "venceEl" TIMESTAMP(3) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "cargadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "certificados_arca_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plantillas_pdf" (
    "tenantId" TEXT NOT NULL,
    "logo" BYTEA,
    "logoMime" TEXT,
    "colorPrimario" TEXT NOT NULL DEFAULT '#111827',
    "colorSecundario" TEXT NOT NULL DEFAULT '#6B7280',
    "textoPie" TEXT,
    "mostrarDuplicado" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plantillas_pdf_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "clientes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "razonSocial" TEXT NOT NULL,
    "tipoDocumento" "TipoDocumento" NOT NULL,
    "numeroDocumento" TEXT NOT NULL,
    "condicionIva" "CondicionIva" NOT NULL,
    "domicilio" TEXT,
    "email" TEXT,
    "pais" TEXT NOT NULL DEFAULT 'AR',
    "monedaPreferida" "Moneda" NOT NULL DEFAULT 'ARS',
    "diasVencimiento" INTEGER,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "datosPadron" JSONB,
    "padronConsultadoEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comprobantes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tipo" "TipoComprobante" NOT NULL,
    "estado" "EstadoComprobante" NOT NULL DEFAULT 'BORRADOR',
    "ambiente" "AmbienteArca" NOT NULL,
    "clienteId" TEXT NOT NULL,
    "puntoVentaId" TEXT NOT NULL,
    "numero" INTEGER,
    "numeroReservado" INTEGER,
    "fechaEmision" DATE NOT NULL,
    "concepto" "ConceptoArca" NOT NULL,
    "fechaServicioDesde" DATE,
    "fechaServicioHasta" DATE,
    "fechaVtoPago" DATE,
    "moneda" "Moneda" NOT NULL DEFAULT 'ARS',
    "cotizacion" DECIMAL(15,6) NOT NULL DEFAULT 1,
    "cancelaMismaMoneda" BOOLEAN NOT NULL DEFAULT false,
    "importeNetoGravado" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "importeNoGravado" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "importeExento" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "importeIva" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "importeTributos" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "importeTotal" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "emisorSnapshot" JSONB,
    "receptorSnapshot" JSONB,
    "asociadoId" TEXT,
    "motivo" TEXT,
    "observaciones" TEXT,
    "cae" TEXT,
    "caeVencimiento" DATE,
    "observacionesArca" JSONB,
    "errorMensaje" TEXT,
    "errorDetalle" TEXT,
    "idempotencyKey" TEXT,
    "payloadHash" TEXT,
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "creadoPorId" TEXT,
    "emitidoPorId" TEXT,
    "emitidoEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comprobantes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comprobante_lineas" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "comprobanteId" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "descripcion" TEXT NOT NULL,
    "cantidad" DECIMAL(15,4) NOT NULL,
    "unidad" "UnidadItem" NOT NULL,
    "precioUnitario" DECIMAL(15,4) NOT NULL,
    "bonificacionPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "alicuotaIva" DECIMAL(5,2) NOT NULL,
    "importeNeto" DECIMAL(15,2) NOT NULL,
    "importeIva" DECIMAL(15,2) NOT NULL,
    "importeTotal" DECIMAL(15,2) NOT NULL,

    CONSTRAINT "comprobante_lineas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comprobante_alicuotas" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "comprobanteId" TEXT NOT NULL,
    "arcaId" INTEGER NOT NULL,
    "baseImponible" DECIMAL(15,2) NOT NULL,
    "importe" DECIMAL(15,2) NOT NULL,

    CONSTRAINT "comprobante_alicuotas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "arca_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "comprobanteId" TEXT,
    "metodo" TEXT NOT NULL,
    "ambiente" "AmbienteArca" NOT NULL,
    "request" JSONB NOT NULL,
    "response" JSONB,
    "exitoso" BOOLEAN NOT NULL,
    "error" TEXT,
    "duracionMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "arca_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "puntos_venta_tenantId_id_key" ON "puntos_venta"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "puntos_venta_tenantId_ambiente_numero_key" ON "puntos_venta"("tenantId", "ambiente", "numero");

-- CreateIndex
CREATE INDEX "certificados_arca_tenantId_ambiente_activo_idx" ON "certificados_arca"("tenantId", "ambiente", "activo");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_tenantId_id_key" ON "clientes"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_tenantId_tipoDocumento_numeroDocumento_key" ON "clientes"("tenantId", "tipoDocumento", "numeroDocumento");

-- CreateIndex
CREATE INDEX "comprobantes_tenantId_estado_idx" ON "comprobantes"("tenantId", "estado");

-- CreateIndex
CREATE INDEX "comprobantes_tenantId_clienteId_idx" ON "comprobantes"("tenantId", "clienteId");

-- CreateIndex
CREATE INDEX "comprobantes_estado_updatedAt_idx" ON "comprobantes"("estado", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "comprobantes_tenantId_id_key" ON "comprobantes"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "comprobantes_tenantId_ambiente_puntoVentaId_tipo_numero_key" ON "comprobantes"("tenantId", "ambiente", "puntoVentaId", "tipo", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "comprobantes_tenantId_idempotencyKey_key" ON "comprobantes"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "comprobante_lineas_tenantId_comprobanteId_idx" ON "comprobante_lineas"("tenantId", "comprobanteId");

-- CreateIndex
CREATE UNIQUE INDEX "comprobante_alicuotas_tenantId_comprobanteId_arcaId_key" ON "comprobante_alicuotas"("tenantId", "comprobanteId", "arcaId");

-- CreateIndex
CREATE INDEX "arca_logs_tenantId_comprobanteId_idx" ON "arca_logs"("tenantId", "comprobanteId");

-- CreateIndex
CREATE INDEX "arca_logs_tenantId_createdAt_idx" ON "arca_logs"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "puntos_venta" ADD CONSTRAINT "puntos_venta_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificados_arca" ADD CONSTRAINT "certificados_arca_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plantillas_pdf" ADD CONSTRAINT "plantillas_pdf_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprobantes" ADD CONSTRAINT "comprobantes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprobantes" ADD CONSTRAINT "comprobantes_tenantId_clienteId_fkey" FOREIGN KEY ("tenantId", "clienteId") REFERENCES "clientes"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprobantes" ADD CONSTRAINT "comprobantes_tenantId_puntoVentaId_fkey" FOREIGN KEY ("tenantId", "puntoVentaId") REFERENCES "puntos_venta"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprobantes" ADD CONSTRAINT "comprobantes_tenantId_asociadoId_fkey" FOREIGN KEY ("tenantId", "asociadoId") REFERENCES "comprobantes"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprobante_lineas" ADD CONSTRAINT "comprobante_lineas_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprobante_lineas" ADD CONSTRAINT "comprobante_lineas_tenantId_comprobanteId_fkey" FOREIGN KEY ("tenantId", "comprobanteId") REFERENCES "comprobantes"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprobante_alicuotas" ADD CONSTRAINT "comprobante_alicuotas_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprobante_alicuotas" ADD CONSTRAINT "comprobante_alicuotas_tenantId_comprobanteId_fkey" FOREIGN KEY ("tenantId", "comprobanteId") REFERENCES "comprobantes"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arca_logs" ADD CONSTRAINT "arca_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arca_logs" ADD CONSTRAINT "arca_logs_tenantId_comprobanteId_fkey" FOREIGN KEY ("tenantId", "comprobanteId") REFERENCES "comprobantes"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
