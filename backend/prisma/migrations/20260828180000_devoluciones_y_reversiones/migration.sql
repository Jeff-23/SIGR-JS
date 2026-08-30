CREATE TABLE "DevolucionPago" (
    "id" SERIAL NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "motivo" VARCHAR(250) NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idempotenciaClave" VARCHAR(100) NOT NULL,
    "idempotenciaHash" VARCHAR(64) NOT NULL,
    "pagoId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "movimientoCajaId" INTEGER,
    CONSTRAINT "DevolucionPago_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReversionVenta" (
    "id" SERIAL NOT NULL,
    "motivo" VARCHAR(250) NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idempotenciaClave" VARCHAR(100) NOT NULL,
    "idempotenciaHash" VARCHAR(64) NOT NULL,
    "ventaId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    CONSTRAINT "ReversionVenta_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DevolucionPago_movimientoCajaId_key" ON "DevolucionPago"("movimientoCajaId");
CREATE UNIQUE INDEX "DevolucionPago_pagoId_idempotenciaClave_key" ON "DevolucionPago"("pagoId", "idempotenciaClave");
CREATE INDEX "DevolucionPago_pagoId_idx" ON "DevolucionPago"("pagoId");
CREATE INDEX "DevolucionPago_usuarioId_idx" ON "DevolucionPago"("usuarioId");
CREATE INDEX "DevolucionPago_creadoEn_idx" ON "DevolucionPago"("creadoEn");
CREATE INDEX "ReversionVenta_idempotenciaClave_idx" ON "ReversionVenta"("idempotenciaClave");
CREATE UNIQUE INDEX "ReversionVenta_ventaId_key" ON "ReversionVenta"("ventaId");
CREATE INDEX "ReversionVenta_usuarioId_idx" ON "ReversionVenta"("usuarioId");
CREATE INDEX "ReversionVenta_creadoEn_idx" ON "ReversionVenta"("creadoEn");

ALTER TABLE "DevolucionPago" ADD CONSTRAINT "DevolucionPago_pagoId_fkey" FOREIGN KEY ("pagoId") REFERENCES "Pago"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DevolucionPago" ADD CONSTRAINT "DevolucionPago_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DevolucionPago" ADD CONSTRAINT "DevolucionPago_movimientoCajaId_fkey" FOREIGN KEY ("movimientoCajaId") REFERENCES "MovimientoCaja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReversionVenta" ADD CONSTRAINT "ReversionVenta_ventaId_fkey" FOREIGN KEY ("ventaId") REFERENCES "Venta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReversionVenta" ADD CONSTRAINT "ReversionVenta_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
