ALTER TABLE "Producto" ADD COLUMN "favorito" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Producto" ADD COLUMN "disponible" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Pedido" ADD COLUMN "personas" INTEGER;
ALTER TABLE "Pedido" ADD COLUMN "observaciones" VARCHAR(500);

CREATE TABLE "ProductoModificador" (
  "id" SERIAL NOT NULL,
  "nombre" VARCHAR(100) NOT NULL,
  "precio" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "orden" INTEGER NOT NULL DEFAULT 0,
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "productoId" INTEGER NOT NULL,
  CONSTRAINT "ProductoModificador_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProductoModificador_productoId_nombre_key" ON "ProductoModificador"("productoId", "nombre");
CREATE INDEX "ProductoModificador_productoId_activo_orden_idx" ON "ProductoModificador"("productoId", "activo", "orden");
ALTER TABLE "ProductoModificador" ADD CONSTRAINT "ProductoModificador_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "DetallePedidoModificador" (
  "id" SERIAL NOT NULL,
  "nombre" VARCHAR(100) NOT NULL,
  "precioUnitario" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "cantidad" INTEGER NOT NULL DEFAULT 1,
  "subtotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "detallePedidoId" INTEGER NOT NULL,
  "modificadorId" INTEGER,
  CONSTRAINT "DetallePedidoModificador_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DetallePedidoModificador_detallePedidoId_idx" ON "DetallePedidoModificador"("detallePedidoId");
CREATE INDEX "DetallePedidoModificador_modificadorId_idx" ON "DetallePedidoModificador"("modificadorId");
ALTER TABLE "DetallePedidoModificador" ADD CONSTRAINT "DetallePedidoModificador_detallePedidoId_fkey" FOREIGN KEY ("detallePedidoId") REFERENCES "DetallePedido"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DetallePedidoModificador" ADD CONSTRAINT "DetallePedidoModificador_modificadorId_fkey" FOREIGN KEY ("modificadorId") REFERENCES "ProductoModificador"("id") ON DELETE SET NULL ON UPDATE CASCADE;
