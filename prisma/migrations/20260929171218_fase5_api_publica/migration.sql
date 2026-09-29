-- CreateEnum
CREATE TYPE "EstadoWebhookEntrega" AS ENUM ('PENDIENTE', 'ENTREGADA', 'FALLIDA');

-- CreateTable
CREATE TABLE "solicitudes_idempotentes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "integracionId" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "hashRequest" TEXT NOT NULL,
    "estadoHttp" INTEGER,
    "respuesta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiraEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "solicitudes_idempotentes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_suscripciones" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "integracionId" TEXT,
    "url" TEXT NOT NULL,
    "eventos" TEXT[],
    "secretoCifrado" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_suscripciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_entregas" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "suscripcionId" TEXT NOT NULL,
    "eventoId" TEXT NOT NULL,
    "evento" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "estado" "EstadoWebhookEntrega" NOT NULL DEFAULT 'PENDIENTE',
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "proximoIntento" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimoStatus" INTEGER,
    "ultimoError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "entregadaEn" TIMESTAMP(3),

    CONSTRAINT "webhook_entregas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "solicitudes_idempotentes_expiraEn_idx" ON "solicitudes_idempotentes"("expiraEn");

-- CreateIndex
CREATE UNIQUE INDEX "solicitudes_idempotentes_tenantId_integracionId_clave_key" ON "solicitudes_idempotentes"("tenantId", "integracionId", "clave");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_suscripciones_tenantId_id_key" ON "webhook_suscripciones"("tenantId", "id");

-- CreateIndex
CREATE INDEX "webhook_entregas_estado_proximoIntento_idx" ON "webhook_entregas"("estado", "proximoIntento");

-- CreateIndex
CREATE INDEX "webhook_entregas_tenantId_suscripcionId_createdAt_idx" ON "webhook_entregas"("tenantId", "suscripcionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_entregas_suscripcionId_eventoId_key" ON "webhook_entregas"("suscripcionId", "eventoId");

-- AddForeignKey
ALTER TABLE "solicitudes_idempotentes" ADD CONSTRAINT "solicitudes_idempotentes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_idempotentes" ADD CONSTRAINT "solicitudes_idempotentes_tenantId_integracionId_fkey" FOREIGN KEY ("tenantId", "integracionId") REFERENCES "integraciones"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_suscripciones" ADD CONSTRAINT "webhook_suscripciones_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_suscripciones" ADD CONSTRAINT "webhook_suscripciones_tenantId_integracionId_fkey" FOREIGN KEY ("tenantId", "integracionId") REFERENCES "integraciones"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_entregas" ADD CONSTRAINT "webhook_entregas_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_entregas" ADD CONSTRAINT "webhook_entregas_tenantId_suscripcionId_fkey" FOREIGN KEY ("tenantId", "suscripcionId") REFERENCES "webhook_suscripciones"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
