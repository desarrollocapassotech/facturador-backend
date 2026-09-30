-- El Facturador ya no consulta al tracker: el tracker empuja ítems por la API pública.
-- DropForeignKey
ALTER TABLE "conexiones_tracker" DROP CONSTRAINT "conexiones_tracker_tenantId_fkey";

-- DropTable
DROP TABLE "conexiones_tracker";
