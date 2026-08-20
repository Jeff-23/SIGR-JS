DROP INDEX IF EXISTS "MovimientoInventario_movimientoOrigenId_idx";

CREATE UNIQUE INDEX "MovimientoInventario_movimientoOrigenId_key"
  ON "MovimientoInventario"("movimientoOrigenId");
