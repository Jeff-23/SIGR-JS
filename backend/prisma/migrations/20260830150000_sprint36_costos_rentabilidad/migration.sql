ALTER TABLE "Producto" ADD COLUMN "rendimientoPorcentaje" DECIMAL(5,2) NOT NULL DEFAULT 100;

CREATE TABLE "HistorialCostoArticulo" (
  "id" SERIAL NOT NULL,
  "costoAnterior" DECIMAL(12,2) NOT NULL,
  "costoNuevo" DECIMAL(12,2) NOT NULL,
  "motivo" VARCHAR(160) NOT NULL,
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "articuloId" INTEGER NOT NULL,
  "recepcionId" INTEGER,
  CONSTRAINT "HistorialCostoArticulo_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HistorialCostoArticulo_articuloId_creadoEn_idx" ON "HistorialCostoArticulo"("articuloId", "creadoEn");
CREATE INDEX "HistorialCostoArticulo_recepcionId_idx" ON "HistorialCostoArticulo"("recepcionId");
ALTER TABLE "HistorialCostoArticulo" ADD CONSTRAINT "HistorialCostoArticulo_articuloId_fkey" FOREIGN KEY ("articuloId") REFERENCES "Articulo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HistorialCostoArticulo" ADD CONSTRAINT "HistorialCostoArticulo_recepcionId_fkey" FOREIGN KEY ("recepcionId") REFERENCES "RecepcionCompra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
