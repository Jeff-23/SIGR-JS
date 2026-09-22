-- Bloque 5D: cada Caja abierta/cerrada representa un turno independiente.
-- Antes de cerrar un restaurante con política FLEXIBLE se congela una fotografía
-- completa de las operaciones del turno. La descarga del Excel es la barrera
-- técnica obligatoria para permitir el cierre y, en 5E, las exclusiones.
ALTER TABLE "Caja"
  ADD COLUMN "preCierreGeneradoEn" TIMESTAMP(3),
  ADD COLUMN "preCierreExcelDescargadoEn" TIMESTAMP(3),
  ADD COLUMN "preCierreSnapshot" JSONB,
  ADD COLUMN "preCierreHash" VARCHAR(64),
  ADD COLUMN "preCierreGeneradoPorId" INTEGER;

CREATE INDEX "Caja_preCierreGeneradoEn_idx" ON "Caja"("preCierreGeneradoEn");
