CREATE TYPE "EstadoCuentaPorPagar" AS ENUM ('PENDIENTE', 'PARCIAL', 'PAGADA', 'VENCIDA', 'CANCELADA');

CREATE TABLE "FacturaProveedor" (
    "id" SERIAL NOT NULL,
    "numero" VARCHAR(80) NOT NULL,
    "fechaEmision" DATE NOT NULL,
    "fechaVencimiento" DATE NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "saldo" DECIMAL(14,2) NOT NULL,
    "estado" "EstadoCuentaPorPagar" NOT NULL DEFAULT 'PENDIENTE',
    "observaciones" VARCHAR(300),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sucursalId" INTEGER NOT NULL,
    "proveedorId" INTEGER NOT NULL,
    "ordenCompraId" INTEGER,
    "registradoPorId" INTEGER NOT NULL,
    CONSTRAINT "FacturaProveedor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AbonoFacturaProveedor" (
    "id" SERIAL NOT NULL,
    "monto" DECIMAL(14,2) NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metodo" VARCHAR(40) NOT NULL,
    "referencia" VARCHAR(100),
    "observaciones" VARCHAR(250),
    "idempotenciaClave" VARCHAR(100),
    "idempotenciaHash" VARCHAR(64),
    "facturaId" INTEGER NOT NULL,
    "registradoPorId" INTEGER NOT NULL,
    CONSTRAINT "AbonoFacturaProveedor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CierreAdministrativo" (
    "id" SERIAL NOT NULL,
    "fecha" DATE NOT NULL,
    "totalVentas" DECIMAL(14,2) NOT NULL,
    "totalCobrado" DECIMAL(14,2) NOT NULL,
    "nuevasObligaciones" DECIMAL(14,2) NOT NULL,
    "abonosProveedores" DECIMAL(14,2) NOT NULL,
    "saldoProveedores" DECIMAL(14,2) NOT NULL,
    "diferenciaCajas" DECIMAL(14,2) NOT NULL,
    "observaciones" VARCHAR(300),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sucursalId" INTEGER NOT NULL,
    "cerradoPorId" INTEGER NOT NULL,
    CONSTRAINT "CierreAdministrativo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FacturaProveedor_proveedorId_numero_key" ON "FacturaProveedor"("proveedorId", "numero");
CREATE INDEX "FacturaProveedor_sucursalId_estado_fechaVencimiento_idx" ON "FacturaProveedor"("sucursalId", "estado", "fechaVencimiento");
CREATE INDEX "FacturaProveedor_ordenCompraId_idx" ON "FacturaProveedor"("ordenCompraId");
CREATE UNIQUE INDEX "AbonoFacturaProveedor_facturaId_idempotenciaClave_key" ON "AbonoFacturaProveedor"("facturaId", "idempotenciaClave");
CREATE INDEX "AbonoFacturaProveedor_fecha_idx" ON "AbonoFacturaProveedor"("fecha");
CREATE UNIQUE INDEX "CierreAdministrativo_sucursalId_fecha_key" ON "CierreAdministrativo"("sucursalId", "fecha");
CREATE INDEX "CierreAdministrativo_fecha_idx" ON "CierreAdministrativo"("fecha");

ALTER TABLE "FacturaProveedor" ADD CONSTRAINT "FacturaProveedor_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FacturaProveedor" ADD CONSTRAINT "FacturaProveedor_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FacturaProveedor" ADD CONSTRAINT "FacturaProveedor_ordenCompraId_fkey" FOREIGN KEY ("ordenCompraId") REFERENCES "OrdenCompra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FacturaProveedor" ADD CONSTRAINT "FacturaProveedor_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AbonoFacturaProveedor" ADD CONSTRAINT "AbonoFacturaProveedor_facturaId_fkey" FOREIGN KEY ("facturaId") REFERENCES "FacturaProveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AbonoFacturaProveedor" ADD CONSTRAINT "AbonoFacturaProveedor_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CierreAdministrativo" ADD CONSTRAINT "CierreAdministrativo_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CierreAdministrativo" ADD CONSTRAINT "CierreAdministrativo_cerradoPorId_fkey" FOREIGN KEY ("cerradoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
