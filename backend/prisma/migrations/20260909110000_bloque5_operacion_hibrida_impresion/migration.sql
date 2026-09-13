CREATE TYPE "ModoOperacionEstacion" AS ENUM ('KDS', 'IMPRESION', 'KDS_E_IMPRESION');

ALTER TABLE "EstacionPreparacion"
ADD COLUMN "modoOperacion" "ModoOperacionEstacion" NOT NULL DEFAULT 'KDS_E_IMPRESION';

ALTER TABLE "Comanda"
ADD COLUMN "solicitudesImpresion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "fechaUltimaSolicitudImpresion" TIMESTAMP(3),
ADD COLUMN "ultimaSolicitudImpresionPorId" INTEGER;

CREATE INDEX "Comanda_ultimaSolicitudImpresionPorId_idx" ON "Comanda"("ultimaSolicitudImpresionPorId");

ALTER TABLE "Comanda"
ADD CONSTRAINT "Comanda_ultimaSolicitudImpresionPorId_fkey"
FOREIGN KEY ("ultimaSolicitudImpresionPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
