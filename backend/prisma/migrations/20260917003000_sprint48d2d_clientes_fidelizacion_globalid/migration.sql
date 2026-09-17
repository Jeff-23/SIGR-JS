-- Sprint 48D-2D: identidad distribuida para fidelizacion.
-- Aditiva: conserva IDs enteros y agrega UUID global estable.

ALTER TABLE "NivelFidelizacion" ADD COLUMN "globalId" UUID;
UPDATE "NivelFidelizacion" SET "globalId" = gen_random_uuid() WHERE "globalId" IS NULL;
ALTER TABLE "NivelFidelizacion" ALTER COLUMN "globalId" SET NOT NULL;
CREATE UNIQUE INDEX "NivelFidelizacion_globalId_key" ON "NivelFidelizacion"("globalId");

ALTER TABLE "CuentaFidelizacion" ADD COLUMN "globalId" UUID;
UPDATE "CuentaFidelizacion" SET "globalId" = gen_random_uuid() WHERE "globalId" IS NULL;
ALTER TABLE "CuentaFidelizacion" ALTER COLUMN "globalId" SET NOT NULL;
CREATE UNIQUE INDEX "CuentaFidelizacion_globalId_key" ON "CuentaFidelizacion"("globalId");

ALTER TABLE "MovimientoPuntos" ADD COLUMN "globalId" UUID;
UPDATE "MovimientoPuntos" SET "globalId" = gen_random_uuid() WHERE "globalId" IS NULL;
ALTER TABLE "MovimientoPuntos" ALTER COLUMN "globalId" SET NOT NULL;
CREATE UNIQUE INDEX "MovimientoPuntos_globalId_key" ON "MovimientoPuntos"("globalId");

ALTER TABLE "ConsentimientoCliente" ADD COLUMN "globalId" UUID;
UPDATE "ConsentimientoCliente" SET "globalId" = gen_random_uuid() WHERE "globalId" IS NULL;
ALTER TABLE "ConsentimientoCliente" ALTER COLUMN "globalId" SET NOT NULL;
CREATE UNIQUE INDEX "ConsentimientoCliente_globalId_key" ON "ConsentimientoCliente"("globalId");
