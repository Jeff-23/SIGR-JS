/*
  Warnings:

  - A unique constraint covering the columns `[clave]` on the table `Rol` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[restauranteId,nombre]` on the table `Rol` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "AmbitoRol" AS ENUM ('SISTEMA', 'RESTAURANTE');

-- DropIndex
DROP INDEX "Rol_nombre_key";

-- AlterTable
ALTER TABLE "Rol" ADD COLUMN     "ambito" "AmbitoRol",
ADD COLUMN     "clave" VARCHAR(120),
ADD COLUMN     "restauranteId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Rol_clave_key" ON "Rol"("clave");

-- CreateIndex
CREATE INDEX "Rol_ambito_idx" ON "Rol"("ambito");

-- CreateIndex
CREATE INDEX "Rol_restauranteId_idx" ON "Rol"("restauranteId");

-- CreateIndex
CREATE UNIQUE INDEX "Rol_restauranteId_nombre_key" ON "Rol"("restauranteId", "nombre");

-- AddForeignKey
ALTER TABLE "Rol" ADD CONSTRAINT "Rol_restauranteId_fkey" FOREIGN KEY ("restauranteId") REFERENCES "Restaurante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
