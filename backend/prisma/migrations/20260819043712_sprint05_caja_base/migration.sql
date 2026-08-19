-- CreateEnum
CREATE TYPE "TipoMetodoPago" AS ENUM ('EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'QR', 'OTRO');

-- CreateEnum
CREATE TYPE "EstadoCaja" AS ENUM ('ABIERTA', 'CERRADA');

-- CreateEnum
CREATE TYPE "TipoMovimientoCaja" AS ENUM ('INGRESO', 'EGRESO');

-- AlterTable
ALTER TABLE "MetodoPago" ADD COLUMN     "tipo" "TipoMetodoPago" NOT NULL DEFAULT 'OTRO';

-- AlterTable
ALTER TABLE "Pago" ADD COLUMN     "cajaId" INTEGER,
ADD COLUMN     "usuarioId" INTEGER;

-- CreateTable
CREATE TABLE "Caja" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,
    "estado" "EstadoCaja" NOT NULL DEFAULT 'ABIERTA',
    "saldoInicial" DECIMAL(12,2) NOT NULL,
    "saldoEsperado" DECIMAL(12,2),
    "saldoContado" DECIMAL(12,2),
    "diferencia" DECIMAL(12,2),
    "totalEfectivoSistema" DECIMAL(12,2),
    "totalOtrosPagos" DECIMAL(12,2),
    "totalIngresos" DECIMAL(12,2),
    "totalEgresos" DECIMAL(12,2),
    "fechaApertura" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaCierre" TIMESTAMP(3),
    "observacionApertura" VARCHAR(250),
    "observacionCierre" VARCHAR(250),
    "sucursalId" INTEGER NOT NULL,
    "abiertaPorId" INTEGER NOT NULL,
    "cerradaPorId" INTEGER,

    CONSTRAINT "Caja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimientoCaja" (
    "id" SERIAL NOT NULL,
    "tipo" "TipoMovimientoCaja" NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "concepto" VARCHAR(120) NOT NULL,
    "observacion" VARCHAR(250),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cajaId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,

    CONSTRAINT "MovimientoCaja_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Caja_sucursalId_idx" ON "Caja"("sucursalId");

-- CreateIndex
CREATE INDEX "Caja_estado_idx" ON "Caja"("estado");

-- CreateIndex
CREATE INDEX "Caja_fechaApertura_idx" ON "Caja"("fechaApertura");

-- CreateIndex
CREATE INDEX "Caja_abiertaPorId_idx" ON "Caja"("abiertaPorId");

-- CreateIndex
CREATE INDEX "Caja_cerradaPorId_idx" ON "Caja"("cerradaPorId");

-- CreateIndex
CREATE INDEX "MovimientoCaja_cajaId_idx" ON "MovimientoCaja"("cajaId");

-- CreateIndex
CREATE INDEX "MovimientoCaja_usuarioId_idx" ON "MovimientoCaja"("usuarioId");

-- CreateIndex
CREATE INDEX "MovimientoCaja_tipo_idx" ON "MovimientoCaja"("tipo");

-- CreateIndex
CREATE INDEX "MovimientoCaja_creadoEn_idx" ON "MovimientoCaja"("creadoEn");

-- CreateIndex
CREATE INDEX "MetodoPago_tipo_idx" ON "MetodoPago"("tipo");

-- CreateIndex
CREATE INDEX "Pago_cajaId_idx" ON "Pago"("cajaId");

-- CreateIndex
CREATE INDEX "Pago_usuarioId_idx" ON "Pago"("usuarioId");

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_cajaId_fkey" FOREIGN KEY ("cajaId") REFERENCES "Caja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Caja" ADD CONSTRAINT "Caja_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Caja" ADD CONSTRAINT "Caja_abiertaPorId_fkey" FOREIGN KEY ("abiertaPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Caja" ADD CONSTRAINT "Caja_cerradaPorId_fkey" FOREIGN KEY ("cerradaPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoCaja" ADD CONSTRAINT "MovimientoCaja_cajaId_fkey" FOREIGN KEY ("cajaId") REFERENCES "Caja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoCaja" ADD CONSTRAINT "MovimientoCaja_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
