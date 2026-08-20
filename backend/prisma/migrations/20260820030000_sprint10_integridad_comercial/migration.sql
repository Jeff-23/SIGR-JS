ALTER TABLE "Pedido"
  ALTER COLUMN "total" TYPE DECIMAL(12,2);

ALTER TABLE "Factura"
  ALTER COLUMN "total" TYPE DECIMAL(12,2);

ALTER TABLE "Venta"
  ADD COLUMN "idempotenciaClave" VARCHAR(100),
  ADD COLUMN "idempotenciaHash" VARCHAR(64);

ALTER TABLE "Pago"
  ADD COLUMN "idempotenciaClave" VARCHAR(100),
  ADD COLUMN "idempotenciaHash" VARCHAR(64);

CREATE UNIQUE INDEX "Venta_sucursalId_idempotenciaClave_key"
  ON "Venta"("sucursalId", "idempotenciaClave");

CREATE UNIQUE INDEX "Pago_ventaId_idempotenciaClave_key"
  ON "Pago"("ventaId", "idempotenciaClave");
