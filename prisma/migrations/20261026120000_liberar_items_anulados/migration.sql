-- Los ítems de facturas ya anuladas (nota de crédito por el total) vuelven a estar disponibles
-- para facturarlos de nuevo, como hace ahora la emisión de la nota.
UPDATE "items_facturables" i
SET "estado" = 'VALIDO', "comprobanteId" = NULL, "updatedAt" = NOW()
FROM "comprobantes" c
WHERE c."tenantId" = i."tenantId"
  AND c."id" = i."comprobanteId"
  AND c."estado" = 'ANULADO'
  AND i."estado" = 'FACTURADO';
