-- Bloque 5E: exclusión controlada de comprobantes internos durante el cierre.
-- No elimina ventas, pagos, caja, comandas ni inventario. Solo retira el
-- comprobante interno del universo operativo/fiscal posterior al precierre.
ALTER TABLE "Factura"
ADD COLUMN "excluidaCierreEn" TIMESTAMP(3),
ADD COLUMN "excluidaCierreCajaId" INTEGER,
ADD COLUMN "excluidaCierrePorId" INTEGER,
ADD COLUMN "exclusionCierreMotivo" VARCHAR(250);

CREATE INDEX "Factura_excluidaCierreEn_idx" ON "Factura"("excluidaCierreEn");
CREATE INDEX "Factura_excluidaCierreCajaId_idx" ON "Factura"("excluidaCierreCajaId");
