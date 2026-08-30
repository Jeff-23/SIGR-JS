CREATE TYPE "EstadoSolicitudPedidoQr" AS ENUM ('PENDIENTE', 'ACEPTADA', 'RECHAZADA');

ALTER TABLE "Pedido" ALTER COLUMN "usuarioId" DROP NOT NULL;

CREATE TABLE "AccesoMesaQr" (
  "id" SERIAL NOT NULL,
  "token" VARCHAR(64) NOT NULL,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizadoEn" TIMESTAMP(3) NOT NULL,
  "mesaId" INTEGER NOT NULL,
  CONSTRAINT "AccesoMesaQr_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SolicitudPedidoQr" (
  "id" UUID NOT NULL,
  "claveCliente" VARCHAR(100) NOT NULL,
  "estado" "EstadoSolicitudPedidoQr" NOT NULL DEFAULT 'PENDIENTE',
  "nombreCliente" VARCHAR(120),
  "observaciones" VARCHAR(300),
  "total" DECIMAL(12,2) NOT NULL,
  "motivoRechazo" VARCHAR(300),
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizadoEn" TIMESTAMP(3) NOT NULL,
  "resueltoEn" TIMESTAMP(3),
  "sucursalId" INTEGER NOT NULL,
  "mesaId" INTEGER NOT NULL,
  "pedidoId" INTEGER,
  "aceptadoPorId" INTEGER,
  CONSTRAINT "SolicitudPedidoQr_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DetalleSolicitudPedidoQr" (
  "id" SERIAL NOT NULL,
  "cantidad" INTEGER NOT NULL,
  "precioUnitario" DECIMAL(10,2) NOT NULL,
  "subtotal" DECIMAL(10,2) NOT NULL,
  "observaciones" VARCHAR(300),
  "solicitudId" UUID NOT NULL,
  "productoId" INTEGER NOT NULL,
  CONSTRAINT "DetalleSolicitudPedidoQr_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccesoMesaQr_token_key" ON "AccesoMesaQr"("token");
CREATE UNIQUE INDEX "AccesoMesaQr_mesaId_key" ON "AccesoMesaQr"("mesaId");
CREATE UNIQUE INDEX "SolicitudPedidoQr_pedidoId_key" ON "SolicitudPedidoQr"("pedidoId");
CREATE UNIQUE INDEX "SolicitudPedidoQr_sucursalId_claveCliente_key" ON "SolicitudPedidoQr"("sucursalId", "claveCliente");
CREATE INDEX "SolicitudPedidoQr_sucursalId_estado_creadoEn_idx" ON "SolicitudPedidoQr"("sucursalId", "estado", "creadoEn");
CREATE INDEX "DetalleSolicitudPedidoQr_solicitudId_idx" ON "DetalleSolicitudPedidoQr"("solicitudId");

ALTER TABLE "AccesoMesaQr" ADD CONSTRAINT "AccesoMesaQr_mesaId_fkey" FOREIGN KEY ("mesaId") REFERENCES "Mesa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SolicitudPedidoQr" ADD CONSTRAINT "SolicitudPedidoQr_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SolicitudPedidoQr" ADD CONSTRAINT "SolicitudPedidoQr_mesaId_fkey" FOREIGN KEY ("mesaId") REFERENCES "Mesa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SolicitudPedidoQr" ADD CONSTRAINT "SolicitudPedidoQr_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SolicitudPedidoQr" ADD CONSTRAINT "SolicitudPedidoQr_aceptadoPorId_fkey" FOREIGN KEY ("aceptadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DetalleSolicitudPedidoQr" ADD CONSTRAINT "DetalleSolicitudPedidoQr_solicitudId_fkey" FOREIGN KEY ("solicitudId") REFERENCES "SolicitudPedidoQr"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DetalleSolicitudPedidoQr" ADD CONSTRAINT "DetalleSolicitudPedidoQr_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
