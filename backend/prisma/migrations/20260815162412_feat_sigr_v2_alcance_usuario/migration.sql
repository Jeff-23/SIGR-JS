-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "restauranteId" INTEGER;

-- CreateIndex
CREATE INDEX "Usuario_restauranteId_idx" ON "Usuario"("restauranteId");

-- CreateIndex
CREATE INDEX "Usuario_sucursalId_idx" ON "Usuario"("sucursalId");

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_restauranteId_fkey" FOREIGN KEY ("restauranteId") REFERENCES "Restaurante"("id") ON DELETE SET NULL ON UPDATE CASCADE;
