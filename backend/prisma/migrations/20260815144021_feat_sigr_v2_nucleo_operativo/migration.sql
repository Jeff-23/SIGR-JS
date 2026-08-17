/*
  Warnings:

  - The `situacion` column on the `Mesa` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Added the required column `precioUnitario` to the `DetallePedido` table without a default value. This is not possible if the table is not empty.
  - Added the required column `sucursalId` to the `Pedido` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "EstadoMesa" AS ENUM ('LIBRE', 'OCUPADA', 'RESERVADA', 'PENDIENTE_PAGO', 'FUERA_SERVICIO');

-- CreateEnum
CREATE TYPE "TipoPedido" AS ENUM ('MESA', 'PARA_LLEVAR', 'DOMICILIO', 'MOSTRADOR', 'MANUAL');

-- CreateEnum
CREATE TYPE "EstadoPedido" AS ENUM ('PENDIENTE', 'EN_PREPARACION', 'LISTO', 'ENTREGADO', 'FACTURADO', 'CANCELADO');

-- DropForeignKey
ALTER TABLE "Pedido" DROP CONSTRAINT "Pedido_mesaId_fkey";

-- AlterTable
ALTER TABLE "DetallePedido" ADD COLUMN     "precioUnitario" DECIMAL(10,2) NOT NULL;

-- AlterTable
ALTER TABLE "Mesa" DROP COLUMN "situacion",
ADD COLUMN     "situacion" "EstadoMesa" NOT NULL DEFAULT 'LIBRE';

-- AlterTable
ALTER TABLE "Pedido" ADD COLUMN     "estado" "EstadoPedido" NOT NULL DEFAULT 'PENDIENTE',
ADD COLUMN     "sucursalId" INTEGER NOT NULL,
ADD COLUMN     "tipo" "TipoPedido" NOT NULL DEFAULT 'MESA',
ALTER COLUMN "mesaId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_mesaId_fkey" FOREIGN KEY ("mesaId") REFERENCES "Mesa"("id") ON DELETE SET NULL ON UPDATE CASCADE;
