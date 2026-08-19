-- SPRINT 6: INVENTARIO OPERATIVO
-- Base: sprint-05-complete / 9698820
-- Esta migración conserva los datos heredados y tipa las unidades existentes.

CREATE TYPE "EstrategiaInventario" AS ENUM (
  'NO_CONTROLAR',
  'STOCK_DIRECTO',
  'POR_RECETA'
);

CREATE TYPE "UnidadInventario" AS ENUM (
  'UNIDAD',
  'GR',
  'KG',
  'ML',
  'L',
  'PORCION'
);

CREATE TYPE "TipoMovimientoInventario" AS ENUM (
  'ENTRADA',
  'SALIDA_VENTA',
  'AJUSTE_POSITIVO',
  'AJUSTE_NEGATIVO',
  'MERMA',
  'DEVOLUCION',
  'CONSUMO_INTERNO',
  'REVERSO_VENTA'
);

-- Producto:
-- el stock heredado era Int? y actualmente no existen productos con stock informado.
-- Se normaliza a Decimal no nulo con valor inicial 0.
ALTER TABLE "Producto"
  ALTER COLUMN "stock" TYPE DECIMAL(14,4)
    USING COALESCE("stock", 0)::DECIMAL(14,4),
  ALTER COLUMN "stock" SET DEFAULT 0,
  ALTER COLUMN "stock" SET NOT NULL;

ALTER TABLE "Producto"
  ADD COLUMN "estrategiaInventario" "EstrategiaInventario"
    NOT NULL DEFAULT 'NO_CONTROLAR',
  ADD COLUMN "unidadInventario" "UnidadInventario"
    NOT NULL DEFAULT 'UNIDAD';

-- Articulo:
-- en la BD validada solo existe el literal heredado "unidad".
-- Se convierte de forma explícita a UNIDAD.
ALTER TABLE "Articulo"
  ALTER COLUMN "stock" TYPE DECIMAL(14,4)
    USING "stock"::DECIMAL(14,4);

ALTER TABLE "Articulo"
  ALTER COLUMN "unidad" DROP DEFAULT;

ALTER TABLE "Articulo"
  ALTER COLUMN "unidad" TYPE "UnidadInventario"
    USING (
      CASE LOWER(TRIM("unidad"))
        WHEN 'unidad' THEN 'UNIDAD'::"UnidadInventario"
        WHEN 'gr' THEN 'GR'::"UnidadInventario"
        WHEN 'kg' THEN 'KG'::"UnidadInventario"
        WHEN 'ml' THEN 'ML'::"UnidadInventario"
        WHEN 'l' THEN 'L'::"UnidadInventario"
        WHEN 'porcion' THEN 'PORCION'::"UnidadInventario"
        WHEN 'porción' THEN 'PORCION'::"UnidadInventario"
        ELSE NULL
      END
    );

ALTER TABLE "Articulo"
  ALTER COLUMN "unidad" SET DEFAULT 'UNIDAD';

-- Si existiera una unidad heredada no reconocida, abortamos en vez de inventar una conversión.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Articulo"
    WHERE "unidad" IS NULL
  ) THEN
    RAISE EXCEPTION
      'Existen artículos con una unidad heredada que no pudo convertirse';
  END IF;
END $$;

ALTER TABLE "Articulo"
  ALTER COLUMN "unidad" SET NOT NULL;

-- Receta:
-- la nueva unidad expresa la cantidad consumida por receta.
-- Para las recetas existentes se hereda inicialmente la unidad base del artículo.
ALTER TABLE "Receta"
  ALTER COLUMN "cantidad" TYPE DECIMAL(14,4)
    USING "cantidad"::DECIMAL(14,4),
  ADD COLUMN "unidad" "UnidadInventario";

UPDATE "Receta" AS r
SET "unidad" = a."unidad"
FROM "Articulo" AS a
WHERE a."id" = r."articuloId";

ALTER TABLE "Receta"
  ALTER COLUMN "unidad" SET NOT NULL;

-- Historial contable/operativo del inventario.
CREATE TABLE "MovimientoInventario" (
  "id" SERIAL NOT NULL,
  "tipo" "TipoMovimientoInventario" NOT NULL,
  "cantidad" DECIMAL(14,4) NOT NULL,
  "unidad" "UnidadInventario" NOT NULL,
  "stockAnterior" DECIMAL(14,4) NOT NULL,
  "stockNuevo" DECIMAL(14,4) NOT NULL,
  "motivo" VARCHAR(250),
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  "sucursalId" INTEGER NOT NULL,
  "usuarioId" INTEGER NOT NULL,
  "ventaId" INTEGER,
  "productoId" INTEGER,
  "articuloId" INTEGER,
  "movimientoOrigenId" INTEGER,

  CONSTRAINT "MovimientoInventario_pkey" PRIMARY KEY ("id"),

  CONSTRAINT "MovimientoInventario_objetivo_check"
    CHECK (
      ("productoId" IS NOT NULL AND "articuloId" IS NULL)
      OR
      ("productoId" IS NULL AND "articuloId" IS NOT NULL)
    ),

  CONSTRAINT "MovimientoInventario_cantidad_check"
    CHECK ("cantidad" > 0),

  CONSTRAINT "MovimientoInventario_stock_check"
    CHECK ("stockAnterior" >= 0 AND "stockNuevo" >= 0)
);

CREATE INDEX "MovimientoInventario_sucursalId_idx"
  ON "MovimientoInventario"("sucursalId");

CREATE INDEX "MovimientoInventario_usuarioId_idx"
  ON "MovimientoInventario"("usuarioId");

CREATE INDEX "MovimientoInventario_ventaId_idx"
  ON "MovimientoInventario"("ventaId");

CREATE INDEX "MovimientoInventario_productoId_idx"
  ON "MovimientoInventario"("productoId");

CREATE INDEX "MovimientoInventario_articuloId_idx"
  ON "MovimientoInventario"("articuloId");

CREATE INDEX "MovimientoInventario_tipo_idx"
  ON "MovimientoInventario"("tipo");

CREATE INDEX "MovimientoInventario_creadoEn_idx"
  ON "MovimientoInventario"("creadoEn");

CREATE INDEX "MovimientoInventario_movimientoOrigenId_idx"
  ON "MovimientoInventario"("movimientoOrigenId");

ALTER TABLE "MovimientoInventario"
  ADD CONSTRAINT "MovimientoInventario_sucursalId_fkey"
  FOREIGN KEY ("sucursalId")
  REFERENCES "Sucursal"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MovimientoInventario"
  ADD CONSTRAINT "MovimientoInventario_usuarioId_fkey"
  FOREIGN KEY ("usuarioId")
  REFERENCES "Usuario"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MovimientoInventario"
  ADD CONSTRAINT "MovimientoInventario_ventaId_fkey"
  FOREIGN KEY ("ventaId")
  REFERENCES "Venta"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MovimientoInventario"
  ADD CONSTRAINT "MovimientoInventario_productoId_fkey"
  FOREIGN KEY ("productoId")
  REFERENCES "Producto"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MovimientoInventario"
  ADD CONSTRAINT "MovimientoInventario_articuloId_fkey"
  FOREIGN KEY ("articuloId")
  REFERENCES "Articulo"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MovimientoInventario"
  ADD CONSTRAINT "MovimientoInventario_movimientoOrigenId_fkey"
  FOREIGN KEY ("movimientoOrigenId")
  REFERENCES "MovimientoInventario"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
