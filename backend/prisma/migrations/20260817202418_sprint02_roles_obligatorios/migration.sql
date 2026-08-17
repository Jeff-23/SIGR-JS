/*
  Warnings:

  - Made the column `ambito` on table `Rol` required. This step will fail if there are existing NULL values in that column.
  - Made the column `clave` on table `Rol` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Rol" ALTER COLUMN "ambito" SET NOT NULL,
ALTER COLUMN "clave" SET NOT NULL;
