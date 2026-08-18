-- CreateEnum
CREATE TYPE "EstadoComanda" AS ENUM ('PENDIENTE', 'EN_PREPARACION', 'LISTA', 'ENTREGADA', 'CANCELADA');

-- CreateTable
CREATE TABLE "Comanda" (
    "id" SERIAL NOT NULL,
    "estado" "EstadoComanda" NOT NULL DEFAULT 'PENDIENTE',
    "fechaEnvio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaInicio" TIMESTAMP(3),
    "fechaLista" TIMESTAMP(3),
    "fechaEntrega" TIMESTAMP(3),
    "pedidoId" INTEGER NOT NULL,

    CONSTRAINT "Comanda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DetalleComanda" (
    "id" SERIAL NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "comandaId" INTEGER NOT NULL,
    "detallePedidoId" INTEGER NOT NULL,

    CONSTRAINT "DetalleComanda_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Comanda_pedidoId_idx" ON "Comanda"("pedidoId");

-- CreateIndex
CREATE INDEX "Comanda_estado_idx" ON "Comanda"("estado");

-- CreateIndex
CREATE INDEX "Comanda_fechaEnvio_idx" ON "Comanda"("fechaEnvio");

-- CreateIndex
CREATE INDEX "DetalleComanda_comandaId_idx" ON "DetalleComanda"("comandaId");

-- CreateIndex
CREATE INDEX "DetalleComanda_detallePedidoId_idx" ON "DetalleComanda"("detallePedidoId");

-- CreateIndex
CREATE UNIQUE INDEX "DetalleComanda_comandaId_detallePedidoId_key" ON "DetalleComanda"("comandaId", "detallePedidoId");

-- CreateIndex
CREATE INDEX "DetallePedido_pedidoId_idx" ON "DetallePedido"("pedidoId");

-- CreateIndex
CREATE INDEX "DetallePedido_productoId_idx" ON "DetallePedido"("productoId");

-- AddForeignKey
ALTER TABLE "Comanda" ADD CONSTRAINT "Comanda_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetalleComanda" ADD CONSTRAINT "DetalleComanda_comandaId_fkey" FOREIGN KEY ("comandaId") REFERENCES "Comanda"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetalleComanda" ADD CONSTRAINT "DetalleComanda_detallePedidoId_fkey" FOREIGN KEY ("detallePedidoId") REFERENCES "DetallePedido"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
