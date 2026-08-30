ALTER TABLE "Caja"
  ADD COLUMN "aperturaClave" VARCHAR(100),
  ADD COLUMN "aperturaHash" VARCHAR(64),
  ADD COLUMN "cierreClave" VARCHAR(100),
  ADD COLUMN "cierreHash" VARCHAR(64);
ALTER TABLE "MovimientoCaja"
  ADD COLUMN "idempotenciaClave" VARCHAR(100),
  ADD COLUMN "idempotenciaHash" VARCHAR(64);
CREATE UNIQUE INDEX "Caja_sucursalId_aperturaClave_key" ON "Caja"("sucursalId", "aperturaClave");
CREATE UNIQUE INDEX "MovimientoCaja_cajaId_idempotenciaClave_key" ON "MovimientoCaja"("cajaId", "idempotenciaClave");
