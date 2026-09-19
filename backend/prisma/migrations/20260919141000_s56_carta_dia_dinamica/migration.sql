CREATE TABLE "CartaDia" (
  "id" SERIAL NOT NULL,
  "fecha" DATE NOT NULL,
  "contenido" JSONB NOT NULL,
  "publicada" BOOLEAN NOT NULL DEFAULT true,
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizadoEn" TIMESTAMP(3) NOT NULL,
  "sucursalId" INTEGER NOT NULL,

  CONSTRAINT "CartaDia_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CartaDia_sucursalId_fecha_key"
ON "CartaDia"("sucursalId", "fecha");

CREATE INDEX "CartaDia_sucursalId_publicada_fecha_idx"
ON "CartaDia"("sucursalId", "publicada", "fecha");

ALTER TABLE "CartaDia"
ADD CONSTRAINT "CartaDia_sucursalId_fkey"
FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
