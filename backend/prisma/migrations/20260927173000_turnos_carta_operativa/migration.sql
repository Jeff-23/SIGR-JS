-- Precio por carta/turno operativo y asociación de personal con la carta de su jornada.
CREATE TABLE "ProductoPerfilCarta" (
  "id" SERIAL NOT NULL,
  "precio" DECIMAL(10,2) NOT NULL,
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizadoEn" TIMESTAMP(3) NOT NULL,
  "perfilCartaId" INTEGER NOT NULL,
  "productoId" INTEGER NOT NULL,
  CONSTRAINT "ProductoPerfilCarta_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductoPerfilCarta_perfilCartaId_productoId_key"
  ON "ProductoPerfilCarta"("perfilCartaId", "productoId");
CREATE INDEX "ProductoPerfilCarta_productoId_perfilCartaId_idx"
  ON "ProductoPerfilCarta"("productoId", "perfilCartaId");

ALTER TABLE "ProductoPerfilCarta"
  ADD CONSTRAINT "ProductoPerfilCarta_perfilCartaId_fkey"
  FOREIGN KEY ("perfilCartaId") REFERENCES "PerfilCarta"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductoPerfilCarta"
  ADD CONSTRAINT "ProductoPerfilCarta_productoId_fkey"
  FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TurnoPersonal" ADD COLUMN "perfilCartaId" INTEGER;
CREATE INDEX "TurnoPersonal_perfilCartaId_inicioProgramado_idx"
  ON "TurnoPersonal"("perfilCartaId", "inicioProgramado");
ALTER TABLE "TurnoPersonal"
  ADD CONSTRAINT "TurnoPersonal_perfilCartaId_fkey"
  FOREIGN KEY ("perfilCartaId") REFERENCES "PerfilCarta"("id") ON DELETE SET NULL ON UPDATE CASCADE;
