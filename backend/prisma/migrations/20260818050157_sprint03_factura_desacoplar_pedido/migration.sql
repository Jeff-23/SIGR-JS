-- DropForeignKey
ALTER TABLE "Factura" DROP CONSTRAINT "Factura_pedidoId_fkey";

-- AlterTable
ALTER TABLE "Factura" ALTER COLUMN "pedidoId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Factura" ADD CONSTRAINT "Factura_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE SET NULL ON UPDATE CASCADE;
