ALTER TABLE "Producto" ADD COLUMN "codigo" VARCHAR(50);
CREATE INDEX "Producto_codigo_idx" ON "Producto"("codigo");
