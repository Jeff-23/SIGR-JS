CREATE TYPE "EstadoDomicilio" AS ENUM ('PENDIENTE_ASIGNACION', 'ASIGNADO', 'EN_RUTA', 'ENTREGADO', 'NO_ENTREGADO', 'CANCELADO');

ALTER TABLE "Mesa"
  ADD COLUMN "ocupacionManual" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "ocupadaManualEn" TIMESTAMP(3),
  ADD COLUMN "ocupadaManualPorId" INTEGER;

ALTER TABLE "Venta"
  ADD COLUMN "numeroComandaPapel" VARCHAR(80),
  ADD COLUMN "numeroSoporte" VARCHAR(80),
  ADD COLUMN "soporteArchivoRef" VARCHAR(500),
  ADD COLUMN "domicilioCosto" DECIMAL(12,2) NOT NULL DEFAULT 0;

CREATE TABLE "Domicilio" (
  "id" SERIAL NOT NULL,
  "estado" "EstadoDomicilio" NOT NULL DEFAULT 'PENDIENTE_ASIGNACION',
  "destinatario" VARCHAR(160) NOT NULL,
  "telefono" VARCHAR(30) NOT NULL,
  "direccion" VARCHAR(250) NOT NULL,
  "referencias" VARCHAR(300),
  "costo" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "asignadoEn" TIMESTAMP(3),
  "enRutaEn" TIMESTAMP(3),
  "entregadoEn" TIMESTAMP(3),
  "observacion" VARCHAR(300),
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizadoEn" TIMESTAMP(3) NOT NULL,
  "pedidoId" INTEGER NOT NULL,
  "repartidorId" INTEGER,
  CONSTRAINT "Domicilio_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Venta_sucursalId_numeroComandaPapel_key" ON "Venta"("sucursalId", "numeroComandaPapel");
CREATE UNIQUE INDEX "Venta_sucursalId_numeroSoporte_key" ON "Venta"("sucursalId", "numeroSoporte");
CREATE UNIQUE INDEX "Domicilio_pedidoId_key" ON "Domicilio"("pedidoId");
CREATE INDEX "Domicilio_estado_creadoEn_idx" ON "Domicilio"("estado", "creadoEn");
CREATE INDEX "Domicilio_repartidorId_idx" ON "Domicilio"("repartidorId");

ALTER TABLE "Mesa" ADD CONSTRAINT "Mesa_ocupadaManualPorId_fkey" FOREIGN KEY ("ocupadaManualPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Domicilio" ADD CONSTRAINT "Domicilio_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Domicilio" ADD CONSTRAINT "Domicilio_repartidorId_fkey" FOREIGN KEY ("repartidorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
