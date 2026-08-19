-- AlterTable
ALTER TABLE "Venta" ADD COLUMN     "clienteId" INTEGER;

-- CreateTable
CREATE TABLE "Cliente" (
    "id" SERIAL NOT NULL,
    "tipoDocumento" VARCHAR(20),
    "numeroDocumento" VARCHAR(30),
    "nombres" VARCHAR(120) NOT NULL,
    "apellidos" VARCHAR(120),
    "telefono" VARCHAR(30),
    "correo" VARCHAR(150),
    "direccion" VARCHAR(200),
    "fechaNacimiento" DATE,
    "estado" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,
    "restauranteId" INTEGER NOT NULL,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Cliente_restauranteId_idx" ON "Cliente"("restauranteId");

-- CreateIndex
CREATE INDEX "Cliente_restauranteId_estado_idx" ON "Cliente"("restauranteId", "estado");

-- CreateIndex
CREATE INDEX "Cliente_restauranteId_nombres_idx" ON "Cliente"("restauranteId", "nombres");

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_restauranteId_numeroDocumento_key" ON "Cliente"("restauranteId", "numeroDocumento");

-- CreateIndex
CREATE INDEX "Venta_clienteId_idx" ON "Venta"("clienteId");

-- AddForeignKey
ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_restauranteId_fkey" FOREIGN KEY ("restauranteId") REFERENCES "Restaurante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venta" ADD CONSTRAINT "Venta_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
