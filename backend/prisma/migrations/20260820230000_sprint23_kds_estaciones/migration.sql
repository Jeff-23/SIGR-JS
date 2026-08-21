CREATE TYPE "PrioridadComanda" AS ENUM ('NORMAL', 'ALTA', 'URGENTE');

CREATE TABLE "EstacionPreparacion" (
  "id" SERIAL NOT NULL,
  "codigo" VARCHAR(40) NOT NULL,
  "nombre" VARCHAR(80) NOT NULL,
  "color" VARCHAR(7) NOT NULL DEFAULT '#F97316',
  "orden" INTEGER NOT NULL DEFAULT 0,
  "estado" BOOLEAN NOT NULL DEFAULT true,
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sucursalId" INTEGER NOT NULL,
  CONSTRAINT "EstacionPreparacion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EstacionPreparacion_sucursalId_codigo_key" ON "EstacionPreparacion"("sucursalId", "codigo");
CREATE INDEX "EstacionPreparacion_sucursalId_estado_idx" ON "EstacionPreparacion"("sucursalId", "estado");
ALTER TABLE "EstacionPreparacion" ADD CONSTRAINT "EstacionPreparacion_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "EstacionPreparacion" ("codigo", "nombre", "color", "orden", "sucursalId")
SELECT 'COCINA', 'Cocina', '#F97316', 10, "id" FROM "Sucursal";
INSERT INTO "EstacionPreparacion" ("codigo", "nombre", "color", "orden", "sucursalId")
SELECT 'BAR', 'Bar', '#3B82F6', 20, "id" FROM "Sucursal";

ALTER TABLE "Producto" ADD COLUMN "estacionId" INTEGER;
UPDATE "Producto" p SET "estacionId" = e."id"
FROM "Categoria" c, "EstacionPreparacion" e
WHERE p."categoriaId" = c."id" AND e."sucursalId" = c."sucursalId"
AND e."codigo" = CASE WHEN lower(c."nombre") ~ '(bebida|bar|licor|jugo|coctel)' THEN 'BAR' ELSE 'COCINA' END;
CREATE INDEX "Producto_estacionId_idx" ON "Producto"("estacionId");
ALTER TABLE "Producto" ADD CONSTRAINT "Producto_estacionId_fkey" FOREIGN KEY ("estacionId") REFERENCES "EstacionPreparacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Comanda" ADD COLUMN "prioridad" "PrioridadComanda" NOT NULL DEFAULT 'NORMAL';
ALTER TABLE "Comanda" ADD COLUMN "estacionId" INTEGER;
UPDATE "Comanda" c SET "estacionId" = e."id"
FROM "Pedido" p, "EstacionPreparacion" e
WHERE c."pedidoId" = p."id" AND e."sucursalId" = p."sucursalId" AND e."codigo" = 'COCINA';
ALTER TABLE "Comanda" ALTER COLUMN "estacionId" SET NOT NULL;
CREATE INDEX "Comanda_estacionId_estado_prioridad_idx" ON "Comanda"("estacionId", "estado", "prioridad");
ALTER TABLE "Comanda" ADD CONSTRAINT "Comanda_estacionId_fkey" FOREIGN KEY ("estacionId") REFERENCES "EstacionPreparacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
