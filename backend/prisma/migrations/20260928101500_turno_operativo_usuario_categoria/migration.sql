-- Turno operativo: la asociación deja de vivir en la programación semanal
-- y pasa a ser una propiedad explícita del usuario. Las categorías pueden
-- limitarse por perfil de carta/turno.

ALTER TABLE "Usuario" ADD COLUMN "perfilCartaId" INTEGER;
CREATE INDEX "Usuario_perfilCartaId_idx" ON "Usuario"("perfilCartaId");
ALTER TABLE "Usuario"
  ADD CONSTRAINT "Usuario_perfilCartaId_fkey"
  FOREIGN KEY ("perfilCartaId") REFERENCES "PerfilCarta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "PerfilCartaCategoria" (
  "perfilCartaId" INTEGER NOT NULL,
  "categoriaId" INTEGER NOT NULL,
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PerfilCartaCategoria_pkey" PRIMARY KEY ("perfilCartaId", "categoriaId")
);
CREATE INDEX "PerfilCartaCategoria_categoriaId_perfilCartaId_idx"
  ON "PerfilCartaCategoria"("categoriaId", "perfilCartaId");
ALTER TABLE "PerfilCartaCategoria"
  ADD CONSTRAINT "PerfilCartaCategoria_perfilCartaId_fkey"
  FOREIGN KEY ("perfilCartaId") REFERENCES "PerfilCarta"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PerfilCartaCategoria"
  ADD CONSTRAINT "PerfilCartaCategoria_categoriaId_fkey"
  FOREIGN KEY ("categoriaId") REFERENCES "Categoria"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Mantiene el comportamiento actual tras migrar: todas las categorías existentes
-- quedan disponibles en todos los perfiles de su misma sucursal hasta que ADMIN
-- las restrinja explícitamente.
INSERT INTO "PerfilCartaCategoria" ("perfilCartaId", "categoriaId")
SELECT pc."id", c."id"
FROM "PerfilCarta" pc
JOIN "Categoria" c ON c."sucursalId" = pc."sucursalId"
ON CONFLICT DO NOTHING;

-- Retira la asociación anterior por jornada. La programación semanal vuelve a
-- manejar únicamente horario, descansos y novedades.
ALTER TABLE "TurnoPersonal" DROP CONSTRAINT IF EXISTS "TurnoPersonal_perfilCartaId_fkey";
DROP INDEX IF EXISTS "TurnoPersonal_perfilCartaId_inicioProgramado_idx";
ALTER TABLE "TurnoPersonal" DROP COLUMN IF EXISTS "perfilCartaId";
