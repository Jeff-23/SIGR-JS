CREATE TYPE "EstadoSolicitudCompra" AS ENUM ('PENDIENTE', 'CONVERTIDA', 'CANCELADA');
CREATE TYPE "EstadoOrdenCompra" AS ENUM ('ABIERTA', 'PARCIAL', 'RECIBIDA', 'CANCELADA');

CREATE TABLE "Proveedor" (
  "id" SERIAL NOT NULL, "nombre" VARCHAR(140) NOT NULL, "identificacion" VARCHAR(30),
  "contacto" VARCHAR(120), "telefono" VARCHAR(30), "correo" VARCHAR(150),
  "estado" BOOLEAN NOT NULL DEFAULT true, "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "restauranteId" INTEGER NOT NULL, CONSTRAINT "Proveedor_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ProveedorArticulo" (
  "proveedorId" INTEGER NOT NULL, "articuloId" INTEGER NOT NULL,
  "precio" DECIMAL(12,2) NOT NULL, "codigo" VARCHAR(60), "actualizadoEn" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProveedorArticulo_pkey" PRIMARY KEY ("proveedorId", "articuloId")
);
CREATE TABLE "SolicitudCompra" (
  "id" SERIAL NOT NULL, "estado" "EstadoSolicitudCompra" NOT NULL DEFAULT 'PENDIENTE',
  "observaciones" VARCHAR(300), "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sucursalId" INTEGER NOT NULL, "proveedorId" INTEGER, "creadoPorId" INTEGER NOT NULL,
  CONSTRAINT "SolicitudCompra_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "DetalleSolicitudCompra" (
  "id" SERIAL NOT NULL, "cantidad" DECIMAL(14,4) NOT NULL,
  "solicitudId" INTEGER NOT NULL, "articuloId" INTEGER NOT NULL,
  CONSTRAINT "DetalleSolicitudCompra_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "OrdenCompra" (
  "id" SERIAL NOT NULL, "estado" "EstadoOrdenCompra" NOT NULL DEFAULT 'ABIERTA',
  "observaciones" VARCHAR(300), "totalEstimado" DECIMAL(14,2) NOT NULL,
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "actualizadoEn" TIMESTAMP(3) NOT NULL,
  "sucursalId" INTEGER NOT NULL, "proveedorId" INTEGER NOT NULL, "solicitudId" INTEGER,
  "creadoPorId" INTEGER NOT NULL, CONSTRAINT "OrdenCompra_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "DetalleOrdenCompra" (
  "id" SERIAL NOT NULL, "cantidadPedida" DECIMAL(14,4) NOT NULL,
  "cantidadRecibida" DECIMAL(14,4) NOT NULL DEFAULT 0, "precioUnitario" DECIMAL(12,2) NOT NULL,
  "ordenId" INTEGER NOT NULL, "articuloId" INTEGER NOT NULL,
  CONSTRAINT "DetalleOrdenCompra_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "RecepcionCompra" (
  "id" SERIAL NOT NULL, "documento" VARCHAR(80), "observaciones" VARCHAR(300),
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "ordenId" INTEGER NOT NULL,
  "sucursalId" INTEGER NOT NULL, "recibidoPorId" INTEGER NOT NULL,
  CONSTRAINT "RecepcionCompra_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "DetalleRecepcionCompra" (
  "id" SERIAL NOT NULL, "cantidad" DECIMAL(14,4) NOT NULL, "diferencia" DECIMAL(14,4) NOT NULL,
  "recepcionId" INTEGER NOT NULL, "detalleOrdenId" INTEGER NOT NULL, "articuloId" INTEGER NOT NULL,
  CONSTRAINT "DetalleRecepcionCompra_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "MovimientoInventario" ADD COLUMN "recepcionCompraId" INTEGER;

CREATE UNIQUE INDEX "Proveedor_restauranteId_identificacion_key" ON "Proveedor"("restauranteId", "identificacion");
CREATE INDEX "Proveedor_restauranteId_estado_idx" ON "Proveedor"("restauranteId", "estado");
CREATE INDEX "ProveedorArticulo_articuloId_idx" ON "ProveedorArticulo"("articuloId");
CREATE INDEX "SolicitudCompra_sucursalId_estado_creadoEn_idx" ON "SolicitudCompra"("sucursalId", "estado", "creadoEn");
CREATE UNIQUE INDEX "DetalleSolicitudCompra_solicitudId_articuloId_key" ON "DetalleSolicitudCompra"("solicitudId", "articuloId");
CREATE UNIQUE INDEX "OrdenCompra_solicitudId_key" ON "OrdenCompra"("solicitudId");
CREATE INDEX "OrdenCompra_sucursalId_estado_creadoEn_idx" ON "OrdenCompra"("sucursalId", "estado", "creadoEn");
CREATE UNIQUE INDEX "DetalleOrdenCompra_ordenId_articuloId_key" ON "DetalleOrdenCompra"("ordenId", "articuloId");
CREATE INDEX "RecepcionCompra_ordenId_creadoEn_idx" ON "RecepcionCompra"("ordenId", "creadoEn");
CREATE UNIQUE INDEX "DetalleRecepcionCompra_recepcionId_detalleOrdenId_key" ON "DetalleRecepcionCompra"("recepcionId", "detalleOrdenId");
CREATE INDEX "MovimientoInventario_recepcionCompraId_idx" ON "MovimientoInventario"("recepcionCompraId");

ALTER TABLE "Proveedor" ADD CONSTRAINT "Proveedor_restauranteId_fkey" FOREIGN KEY ("restauranteId") REFERENCES "Restaurante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProveedorArticulo" ADD CONSTRAINT "ProveedorArticulo_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProveedorArticulo" ADD CONSTRAINT "ProveedorArticulo_articuloId_fkey" FOREIGN KEY ("articuloId") REFERENCES "Articulo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SolicitudCompra" ADD CONSTRAINT "SolicitudCompra_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SolicitudCompra" ADD CONSTRAINT "SolicitudCompra_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SolicitudCompra" ADD CONSTRAINT "SolicitudCompra_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DetalleSolicitudCompra" ADD CONSTRAINT "DetalleSolicitudCompra_solicitudId_fkey" FOREIGN KEY ("solicitudId") REFERENCES "SolicitudCompra"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DetalleSolicitudCompra" ADD CONSTRAINT "DetalleSolicitudCompra_articuloId_fkey" FOREIGN KEY ("articuloId") REFERENCES "Articulo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrdenCompra" ADD CONSTRAINT "OrdenCompra_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrdenCompra" ADD CONSTRAINT "OrdenCompra_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrdenCompra" ADD CONSTRAINT "OrdenCompra_solicitudId_fkey" FOREIGN KEY ("solicitudId") REFERENCES "SolicitudCompra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrdenCompra" ADD CONSTRAINT "OrdenCompra_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DetalleOrdenCompra" ADD CONSTRAINT "DetalleOrdenCompra_ordenId_fkey" FOREIGN KEY ("ordenId") REFERENCES "OrdenCompra"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DetalleOrdenCompra" ADD CONSTRAINT "DetalleOrdenCompra_articuloId_fkey" FOREIGN KEY ("articuloId") REFERENCES "Articulo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecepcionCompra" ADD CONSTRAINT "RecepcionCompra_ordenId_fkey" FOREIGN KEY ("ordenId") REFERENCES "OrdenCompra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecepcionCompra" ADD CONSTRAINT "RecepcionCompra_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecepcionCompra" ADD CONSTRAINT "RecepcionCompra_recibidoPorId_fkey" FOREIGN KEY ("recibidoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DetalleRecepcionCompra" ADD CONSTRAINT "DetalleRecepcionCompra_recepcionId_fkey" FOREIGN KEY ("recepcionId") REFERENCES "RecepcionCompra"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DetalleRecepcionCompra" ADD CONSTRAINT "DetalleRecepcionCompra_detalleOrdenId_fkey" FOREIGN KEY ("detalleOrdenId") REFERENCES "DetalleOrdenCompra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DetalleRecepcionCompra" ADD CONSTRAINT "DetalleRecepcionCompra_articuloId_fkey" FOREIGN KEY ("articuloId") REFERENCES "Articulo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MovimientoInventario" ADD CONSTRAINT "MovimientoInventario_recepcionCompraId_fkey" FOREIGN KEY ("recepcionCompraId") REFERENCES "RecepcionCompra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
