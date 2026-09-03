-- DropForeignKey
ALTER TABLE "Pedido" DROP CONSTRAINT "Pedido_usuarioId_fkey";

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
