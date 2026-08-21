ALTER TABLE "Pedido"
ADD COLUMN "idempotenciaClave" VARCHAR(100),
ADD COLUMN "idempotenciaHash" VARCHAR(64);

ALTER TABLE "DetallePedido"
ADD COLUMN "observaciones" VARCHAR(300);

CREATE UNIQUE INDEX "Pedido_sucursalId_idempotenciaClave_key"
ON "Pedido"("sucursalId", "idempotenciaClave");

CREATE INDEX "Pedido_sucursalId_creadoEn_idx"
ON "Pedido"("sucursalId", "creadoEn");
