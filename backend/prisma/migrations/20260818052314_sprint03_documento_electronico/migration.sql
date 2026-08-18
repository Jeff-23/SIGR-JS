-- CreateEnum
CREATE TYPE "EstadoDocumentoElectronico" AS ENUM ('PREPARADO', 'ENVIANDO', 'ENVIADO', 'ACEPTADO', 'RECHAZADO', 'ERROR');

-- CreateTable
CREATE TABLE "DocumentoElectronico" (
    "id" SERIAL NOT NULL,
    "estado" "EstadoDocumentoElectronico" NOT NULL DEFAULT 'PREPARADO',
    "cufe" TEXT,
    "qrCode" TEXT,
    "respuestaProveedor" JSONB,
    "enviadoEn" TIMESTAMP(3),
    "respondidoEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,
    "facturaId" INTEGER NOT NULL,

    CONSTRAINT "DocumentoElectronico_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentoElectronico_facturaId_key" ON "DocumentoElectronico"("facturaId");

-- CreateIndex
CREATE INDEX "DocumentoElectronico_estado_idx" ON "DocumentoElectronico"("estado");

-- CreateIndex
CREATE INDEX "DocumentoElectronico_creadoEn_idx" ON "DocumentoElectronico"("creadoEn");

-- AddForeignKey
ALTER TABLE "DocumentoElectronico" ADD CONSTRAINT "DocumentoElectronico_facturaId_fkey" FOREIGN KEY ("facturaId") REFERENCES "Factura"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
