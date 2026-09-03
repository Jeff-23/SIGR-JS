-- Sprint 42: KDS Cocina/Bar operativo y control de promesa de servicio.
CREATE TYPE "EstadoDetalleComanda" AS ENUM ('PENDIENTE', 'EN_PREPARACION', 'LISTA');

ALTER TABLE "EstacionPreparacion"
  ADD COLUMN "objetivoPreparacionMin" INTEGER NOT NULL DEFAULT 15;

ALTER TABLE "Comanda"
  ADD COLUMN "fechaVista" TIMESTAMP(3),
  ADD COLUMN "metaPreparacionMin" INTEGER NOT NULL DEFAULT 15,
  ADD COLUMN "vistoPorId" INTEGER;

ALTER TABLE "DetalleComanda"
  ADD COLUMN "estado" "EstadoDetalleComanda" NOT NULL DEFAULT 'PENDIENTE',
  ADD COLUMN "fechaInicio" TIMESTAMP(3),
  ADD COLUMN "fechaLista" TIMESTAMP(3);

-- Conservar coherencia para comandas ya existentes al aplicar la migración.
UPDATE "DetalleComanda" AS d
SET "estado" = 'EN_PREPARACION',
    "fechaInicio" = COALESCE(c."fechaInicio", c."fechaEnvio")
FROM "Comanda" AS c
WHERE d."comandaId" = c."id"
  AND c."estado" = 'EN_PREPARACION';

UPDATE "DetalleComanda" AS d
SET "estado" = 'LISTA',
    "fechaInicio" = COALESCE(c."fechaInicio", c."fechaEnvio"),
    "fechaLista" = COALESCE(c."fechaLista", c."fechaEnvio")
FROM "Comanda" AS c
WHERE d."comandaId" = c."id"
  AND c."estado" IN ('LISTA', 'ENTREGADA');

ALTER TABLE "Comanda"
  ADD CONSTRAINT "Comanda_vistoPorId_fkey"
  FOREIGN KEY ("vistoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Comanda_vistoPorId_idx" ON "Comanda"("vistoPorId");
CREATE INDEX "DetalleComanda_estado_idx" ON "DetalleComanda"("estado");
