-- Sprint 48A: identidad distribuida para SIGR híbrido Edge + Cloud
-- Aditiva: conserva los IDs enteros actuales y añade UUID global estable.

ALTER TABLE "Restaurante" ADD COLUMN "globalId" UUID;
UPDATE "Restaurante" SET "globalId" = gen_random_uuid() WHERE "globalId" IS NULL;
ALTER TABLE "Restaurante" ALTER COLUMN "globalId" SET NOT NULL;
CREATE UNIQUE INDEX "Restaurante_globalId_key" ON "Restaurante"("globalId");

ALTER TABLE "Cliente" ADD COLUMN "globalId" UUID;
UPDATE "Cliente" SET "globalId" = gen_random_uuid() WHERE "globalId" IS NULL;
ALTER TABLE "Cliente" ALTER COLUMN "globalId" SET NOT NULL;
CREATE UNIQUE INDEX "Cliente_globalId_key" ON "Cliente"("globalId");

ALTER TABLE "Sucursal" ADD COLUMN "globalId" UUID;
UPDATE "Sucursal" SET "globalId" = gen_random_uuid() WHERE "globalId" IS NULL;
ALTER TABLE "Sucursal" ALTER COLUMN "globalId" SET NOT NULL;
CREATE UNIQUE INDEX "Sucursal_globalId_key" ON "Sucursal"("globalId");

ALTER TABLE "Usuario" ADD COLUMN "globalId" UUID;
UPDATE "Usuario" SET "globalId" = gen_random_uuid() WHERE "globalId" IS NULL;
ALTER TABLE "Usuario" ALTER COLUMN "globalId" SET NOT NULL;
CREATE UNIQUE INDEX "Usuario_globalId_key" ON "Usuario"("globalId");

ALTER TABLE "Mesa" ADD COLUMN "globalId" UUID;
UPDATE "Mesa" SET "globalId" = gen_random_uuid() WHERE "globalId" IS NULL;
ALTER TABLE "Mesa" ALTER COLUMN "globalId" SET NOT NULL;
CREATE UNIQUE INDEX "Mesa_globalId_key" ON "Mesa"("globalId");

ALTER TABLE "Categoria" ADD COLUMN "globalId" UUID;
UPDATE "Categoria" SET "globalId" = gen_random_uuid() WHERE "globalId" IS NULL;
ALTER TABLE "Categoria" ALTER COLUMN "globalId" SET NOT NULL;
CREATE UNIQUE INDEX "Categoria_globalId_key" ON "Categoria"("globalId");

ALTER TABLE "Producto" ADD COLUMN "globalId" UUID;
UPDATE "Producto" SET "globalId" = gen_random_uuid() WHERE "globalId" IS NULL;
ALTER TABLE "Producto" ALTER COLUMN "globalId" SET NOT NULL;
CREATE UNIQUE INDEX "Producto_globalId_key" ON "Producto"("globalId");

ALTER TABLE "EstacionPreparacion" ADD COLUMN "globalId" UUID;
UPDATE "EstacionPreparacion" SET "globalId" = gen_random_uuid() WHERE "globalId" IS NULL;
ALTER TABLE "EstacionPreparacion" ALTER COLUMN "globalId" SET NOT NULL;
CREATE UNIQUE INDEX "EstacionPreparacion_globalId_key" ON "EstacionPreparacion"("globalId");

ALTER TABLE "Pedido" ADD COLUMN "globalId" UUID;
UPDATE "Pedido" SET "globalId" = gen_random_uuid() WHERE "globalId" IS NULL;
ALTER TABLE "Pedido" ALTER COLUMN "globalId" SET NOT NULL;
CREATE UNIQUE INDEX "Pedido_globalId_key" ON "Pedido"("globalId");

ALTER TABLE "Domicilio" ADD COLUMN "globalId" UUID;
UPDATE "Domicilio" SET "globalId" = gen_random_uuid() WHERE "globalId" IS NULL;
ALTER TABLE "Domicilio" ALTER COLUMN "globalId" SET NOT NULL;
CREATE UNIQUE INDEX "Domicilio_globalId_key" ON "Domicilio"("globalId");

ALTER TABLE "DetallePedido" ADD COLUMN "globalId" UUID;
UPDATE "DetallePedido" SET "globalId" = gen_random_uuid() WHERE "globalId" IS NULL;
ALTER TABLE "DetallePedido" ALTER COLUMN "globalId" SET NOT NULL;
CREATE UNIQUE INDEX "DetallePedido_globalId_key" ON "DetallePedido"("globalId");

ALTER TABLE "Comanda" ADD COLUMN "globalId" UUID;
UPDATE "Comanda" SET "globalId" = gen_random_uuid() WHERE "globalId" IS NULL;
ALTER TABLE "Comanda" ALTER COLUMN "globalId" SET NOT NULL;
CREATE UNIQUE INDEX "Comanda_globalId_key" ON "Comanda"("globalId");

ALTER TABLE "DetalleComanda" ADD COLUMN "globalId" UUID;
UPDATE "DetalleComanda" SET "globalId" = gen_random_uuid() WHERE "globalId" IS NULL;
ALTER TABLE "DetalleComanda" ALTER COLUMN "globalId" SET NOT NULL;
CREATE UNIQUE INDEX "DetalleComanda_globalId_key" ON "DetalleComanda"("globalId");

ALTER TABLE "Venta" ADD COLUMN "globalId" UUID;
UPDATE "Venta" SET "globalId" = gen_random_uuid() WHERE "globalId" IS NULL;
ALTER TABLE "Venta" ALTER COLUMN "globalId" SET NOT NULL;
CREATE UNIQUE INDEX "Venta_globalId_key" ON "Venta"("globalId");

ALTER TABLE "DetalleVenta" ADD COLUMN "globalId" UUID;
UPDATE "DetalleVenta" SET "globalId" = gen_random_uuid() WHERE "globalId" IS NULL;
ALTER TABLE "DetalleVenta" ALTER COLUMN "globalId" SET NOT NULL;
CREATE UNIQUE INDEX "DetalleVenta_globalId_key" ON "DetalleVenta"("globalId");

ALTER TABLE "Articulo" ADD COLUMN "globalId" UUID;
UPDATE "Articulo" SET "globalId" = gen_random_uuid() WHERE "globalId" IS NULL;
ALTER TABLE "Articulo" ALTER COLUMN "globalId" SET NOT NULL;
CREATE UNIQUE INDEX "Articulo_globalId_key" ON "Articulo"("globalId");

ALTER TABLE "MovimientoInventario" ADD COLUMN "globalId" UUID;
UPDATE "MovimientoInventario" SET "globalId" = gen_random_uuid() WHERE "globalId" IS NULL;
ALTER TABLE "MovimientoInventario" ALTER COLUMN "globalId" SET NOT NULL;
CREATE UNIQUE INDEX "MovimientoInventario_globalId_key" ON "MovimientoInventario"("globalId");

ALTER TABLE "MetodoPago" ADD COLUMN "globalId" UUID;
UPDATE "MetodoPago" SET "globalId" = gen_random_uuid() WHERE "globalId" IS NULL;
ALTER TABLE "MetodoPago" ALTER COLUMN "globalId" SET NOT NULL;
CREATE UNIQUE INDEX "MetodoPago_globalId_key" ON "MetodoPago"("globalId");

ALTER TABLE "Factura" ADD COLUMN "globalId" UUID;
UPDATE "Factura" SET "globalId" = gen_random_uuid() WHERE "globalId" IS NULL;
ALTER TABLE "Factura" ALTER COLUMN "globalId" SET NOT NULL;
CREATE UNIQUE INDEX "Factura_globalId_key" ON "Factura"("globalId");

ALTER TABLE "Pago" ADD COLUMN "globalId" UUID;
UPDATE "Pago" SET "globalId" = gen_random_uuid() WHERE "globalId" IS NULL;
ALTER TABLE "Pago" ALTER COLUMN "globalId" SET NOT NULL;
CREATE UNIQUE INDEX "Pago_globalId_key" ON "Pago"("globalId");

ALTER TABLE "Caja" ADD COLUMN "globalId" UUID;
UPDATE "Caja" SET "globalId" = gen_random_uuid() WHERE "globalId" IS NULL;
ALTER TABLE "Caja" ALTER COLUMN "globalId" SET NOT NULL;
CREATE UNIQUE INDEX "Caja_globalId_key" ON "Caja"("globalId");

ALTER TABLE "MovimientoCaja" ADD COLUMN "globalId" UUID;
UPDATE "MovimientoCaja" SET "globalId" = gen_random_uuid() WHERE "globalId" IS NULL;
ALTER TABLE "MovimientoCaja" ALTER COLUMN "globalId" SET NOT NULL;
CREATE UNIQUE INDEX "MovimientoCaja_globalId_key" ON "MovimientoCaja"("globalId");
