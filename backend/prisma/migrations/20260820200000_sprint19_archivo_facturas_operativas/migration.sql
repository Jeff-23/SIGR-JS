CREATE TYPE "OrigenRegistroFactura" AS ENUM ('SISTEMA', 'PAPEL', 'DIGITACION_DIRECTA', 'IMPORTADO');

CREATE TABLE "RegistroFacturaOperativa" (
    "id" SERIAL NOT NULL,
    "numero" VARCHAR(80) NOT NULL,
    "numeroComanda" VARCHAR(80),
    "numeroSoporte" VARCHAR(80),
    "origen" "OrigenRegistroFactura" NOT NULL,
    "fechaOperacion" TIMESTAMP(3) NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "descuentos" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "impuestos" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "propina" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "domicilio" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL,
    "detalles" JSONB NOT NULL,
    "impuestosDetalle" JSONB,
    "formasPago" JSONB,
    "soporteArchivoRef" VARCHAR(500),
    "observaciones" VARCHAR(500),
    "idempotenciaClave" VARCHAR(100),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,
    "restauranteId" INTEGER NOT NULL,
    "sucursalId" INTEGER NOT NULL,
    "digitadoPorId" INTEGER NOT NULL,
    "ventaId" INTEGER,
    "facturaId" INTEGER,
    CONSTRAINT "RegistroFacturaOperativa_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RegistroFacturaOperativa_facturaId_key" ON "RegistroFacturaOperativa"("facturaId");
CREATE UNIQUE INDEX "RegistroFacturaOperativa_sucursalId_numero_key" ON "RegistroFacturaOperativa"("sucursalId", "numero");
CREATE UNIQUE INDEX "RegistroFacturaOperativa_sucursalId_numeroComanda_key" ON "RegistroFacturaOperativa"("sucursalId", "numeroComanda");
CREATE UNIQUE INDEX "RegistroFacturaOperativa_sucursalId_numeroSoporte_key" ON "RegistroFacturaOperativa"("sucursalId", "numeroSoporte");
CREATE UNIQUE INDEX "RegistroFacturaOperativa_sucursalId_idempotenciaClave_key" ON "RegistroFacturaOperativa"("sucursalId", "idempotenciaClave");
CREATE INDEX "RegistroFacturaOperativa_restauranteId_fechaOperacion_idx" ON "RegistroFacturaOperativa"("restauranteId", "fechaOperacion");
CREATE INDEX "RegistroFacturaOperativa_sucursalId_fechaOperacion_idx" ON "RegistroFacturaOperativa"("sucursalId", "fechaOperacion");
CREATE INDEX "RegistroFacturaOperativa_digitadoPorId_idx" ON "RegistroFacturaOperativa"("digitadoPorId");
CREATE INDEX "RegistroFacturaOperativa_ventaId_idx" ON "RegistroFacturaOperativa"("ventaId");

ALTER TABLE "RegistroFacturaOperativa" ADD CONSTRAINT "RegistroFacturaOperativa_restauranteId_fkey" FOREIGN KEY ("restauranteId") REFERENCES "Restaurante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RegistroFacturaOperativa" ADD CONSTRAINT "RegistroFacturaOperativa_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RegistroFacturaOperativa" ADD CONSTRAINT "RegistroFacturaOperativa_digitadoPorId_fkey" FOREIGN KEY ("digitadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RegistroFacturaOperativa" ADD CONSTRAINT "RegistroFacturaOperativa_ventaId_fkey" FOREIGN KEY ("ventaId") REFERENCES "Venta"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RegistroFacturaOperativa" ADD CONSTRAINT "RegistroFacturaOperativa_facturaId_fkey" FOREIGN KEY ("facturaId") REFERENCES "Factura"("id") ON DELETE SET NULL ON UPDATE CASCADE;
