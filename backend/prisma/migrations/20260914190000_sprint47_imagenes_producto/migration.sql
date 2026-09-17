CREATE TYPE "EstadoMediaProducto" AS ENUM ('ACTIVA', 'PENDIENTE_ELIMINACION', 'ELIMINADA');

CREATE TABLE "ImagenProducto" (
    "id" SERIAL NOT NULL,
    "productoId" INTEGER NOT NULL,
    "restauranteId" INTEGER NOT NULL,
    "tokenPublico" VARCHAR(36) NOT NULL,
    "nombreOriginal" VARCHAR(255) NOT NULL,
    "mimeOriginal" VARCHAR(100) NOT NULL,
    "bytesOriginales" INTEGER NOT NULL,
    "anchoOriginal" INTEGER NOT NULL,
    "altoOriginal" INTEGER NOT NULL,
    "hashSha256" VARCHAR(64) NOT NULL,
    "focoX" INTEGER NOT NULL DEFAULT 50,
    "focoY" INTEGER NOT NULL DEFAULT 50,
    "zoom" DECIMAL(4,2) NOT NULL DEFAULT 1,
    "estado" "EstadoMediaProducto" NOT NULL DEFAULT 'ACTIVA',
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ImagenProducto_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ImagenProducto_productoId_key" ON "ImagenProducto"("productoId");
CREATE UNIQUE INDEX "ImagenProducto_tokenPublico_key" ON "ImagenProducto"("tokenPublico");
CREATE INDEX "ImagenProducto_restauranteId_estado_idx" ON "ImagenProducto"("restauranteId", "estado");

ALTER TABLE "ImagenProducto" ADD CONSTRAINT "ImagenProducto_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ImagenProducto" ADD CONSTRAINT "ImagenProducto_restauranteId_fkey" FOREIGN KEY ("restauranteId") REFERENCES "Restaurante"("id") ON DELETE CASCADE ON UPDATE CASCADE;
