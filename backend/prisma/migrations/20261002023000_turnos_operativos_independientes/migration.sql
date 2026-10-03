CREATE TABLE "TurnoOperativo" (
  "id" SERIAL NOT NULL,
  "globalId" UUID NOT NULL,
  "nombre" VARCHAR(80) NOT NULL,
  "estado" BOOLEAN NOT NULL DEFAULT true,
  "orden" INTEGER NOT NULL DEFAULT 0,
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizadoEn" TIMESTAMP(3) NOT NULL,
  "sucursalId" INTEGER NOT NULL,
  CONSTRAINT "TurnoOperativo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TurnoOperativo_globalId_key" ON "TurnoOperativo"("globalId");
CREATE UNIQUE INDEX "TurnoOperativo_sucursalId_nombre_key" ON "TurnoOperativo"("sucursalId", "nombre");
CREATE INDEX "TurnoOperativo_sucursalId_estado_orden_idx" ON "TurnoOperativo"("sucursalId", "estado", "orden");
ALTER TABLE "TurnoOperativo" ADD CONSTRAINT "TurnoOperativo_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Usuario" ADD COLUMN "turnoOperativoActivoId" INTEGER;
CREATE INDEX "Usuario_turnoOperativoActivoId_idx" ON "Usuario"("turnoOperativoActivoId");
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_turnoOperativoActivoId_fkey" FOREIGN KEY ("turnoOperativoActivoId") REFERENCES "TurnoOperativo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "UsuarioTurnoOperativo" (
  "usuarioId" INTEGER NOT NULL,
  "turnoOperativoId" INTEGER NOT NULL,
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UsuarioTurnoOperativo_pkey" PRIMARY KEY ("usuarioId", "turnoOperativoId")
);
CREATE INDEX "UsuarioTurnoOperativo_turnoOperativoId_usuarioId_idx" ON "UsuarioTurnoOperativo"("turnoOperativoId", "usuarioId");
ALTER TABLE "UsuarioTurnoOperativo" ADD CONSTRAINT "UsuarioTurnoOperativo_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UsuarioTurnoOperativo" ADD CONSTRAINT "UsuarioTurnoOperativo_turnoOperativoId_fkey" FOREIGN KEY ("turnoOperativoId") REFERENCES "TurnoOperativo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PerfilCartaTurnoOperativo" (
  "perfilCartaId" INTEGER NOT NULL,
  "turnoOperativoId" INTEGER NOT NULL,
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PerfilCartaTurnoOperativo_pkey" PRIMARY KEY ("perfilCartaId", "turnoOperativoId")
);
CREATE INDEX "PerfilCartaTurnoOperativo_turnoOperativoId_perfilCartaId_idx" ON "PerfilCartaTurnoOperativo"("turnoOperativoId", "perfilCartaId");
ALTER TABLE "PerfilCartaTurnoOperativo" ADD CONSTRAINT "PerfilCartaTurnoOperativo_perfilCartaId_fkey" FOREIGN KEY ("perfilCartaId") REFERENCES "PerfilCarta"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PerfilCartaTurnoOperativo" ADD CONSTRAINT "PerfilCartaTurnoOperativo_turnoOperativoId_fkey" FOREIGN KEY ("turnoOperativoId") REFERENCES "TurnoOperativo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CategoriaTurnoOperativo" (
  "categoriaId" INTEGER NOT NULL,
  "turnoOperativoId" INTEGER NOT NULL,
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CategoriaTurnoOperativo_pkey" PRIMARY KEY ("categoriaId", "turnoOperativoId")
);
CREATE INDEX "CategoriaTurnoOperativo_turnoOperativoId_categoriaId_idx" ON "CategoriaTurnoOperativo"("turnoOperativoId", "categoriaId");
ALTER TABLE "CategoriaTurnoOperativo" ADD CONSTRAINT "CategoriaTurnoOperativo_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "Categoria"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CategoriaTurnoOperativo" ADD CONSTRAINT "CategoriaTurnoOperativo_turnoOperativoId_fkey" FOREIGN KEY ("turnoOperativoId") REFERENCES "TurnoOperativo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Compatibilidad: cada perfil existente crea inicialmente un turno con el mismo nombre.
INSERT INTO "TurnoOperativo" ("globalId", "nombre", "estado", "orden", "creadoEn", "actualizadoEn", "sucursalId")
SELECT (substr(md5('turno:' || p."sucursalId"::text || ':' || p."nombre"),1,8) || '-' || substr(md5('turno:' || p."sucursalId"::text || ':' || p."nombre"),9,4) || '-' || substr(md5('turno:' || p."sucursalId"::text || ':' || p."nombre"),13,4) || '-' || substr(md5('turno:' || p."sucursalId"::text || ':' || p."nombre"),17,4) || '-' || substr(md5('turno:' || p."sucursalId"::text || ':' || p."nombre"),21,12))::uuid, p."nombre", p."estado", p."orden", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, p."sucursalId"
FROM "PerfilCarta" p
ON CONFLICT ("sucursalId", "nombre") DO NOTHING;

INSERT INTO "PerfilCartaTurnoOperativo" ("perfilCartaId", "turnoOperativoId")
SELECT p."id", t."id"
FROM "PerfilCarta" p
JOIN "TurnoOperativo" t ON t."sucursalId" = p."sucursalId" AND t."nombre" = p."nombre"
ON CONFLICT DO NOTHING;

INSERT INTO "CategoriaTurnoOperativo" ("categoriaId", "turnoOperativoId")
SELECT DISTINCT pc."categoriaId", t."id"
FROM "PerfilCartaCategoria" pc
JOIN "PerfilCarta" p ON p."id" = pc."perfilCartaId"
JOIN "TurnoOperativo" t ON t."sucursalId" = p."sucursalId" AND t."nombre" = p."nombre"
ON CONFLICT DO NOTHING;

INSERT INTO "UsuarioTurnoOperativo" ("usuarioId", "turnoOperativoId")
SELECT u."id", t."id"
FROM "Usuario" u
JOIN "PerfilCarta" p ON p."id" = u."perfilCartaId"
JOIN "TurnoOperativo" t ON t."sucursalId" = p."sucursalId" AND t."nombre" = p."nombre"
WHERE u."perfilCartaId" IS NOT NULL
ON CONFLICT DO NOTHING;

UPDATE "Usuario" u
SET "turnoOperativoActivoId" = t."id"
FROM "PerfilCarta" p, "TurnoOperativo" t
WHERE u."perfilCartaId" = p."id"
  AND t."sucursalId" = p."sucursalId"
  AND t."nombre" = p."nombre";

-- Desde este punto el turno del usuario deja de depender de una carta.
UPDATE "Usuario" SET "perfilCartaId" = NULL WHERE "perfilCartaId" IS NOT NULL;

ALTER TABLE "Pedido" ADD COLUMN "turnoOperativoId" INTEGER;
ALTER TABLE "Pedido" ADD COLUMN "perfilCartaOperativaId" INTEGER;
CREATE INDEX "Pedido_turnoOperativoId_idx" ON "Pedido"("turnoOperativoId");
CREATE INDEX "Pedido_perfilCartaOperativaId_idx" ON "Pedido"("perfilCartaOperativaId");
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_turnoOperativoId_fkey" FOREIGN KEY ("turnoOperativoId") REFERENCES "TurnoOperativo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_perfilCartaOperativaId_fkey" FOREIGN KEY ("perfilCartaOperativaId") REFERENCES "PerfilCarta"("id") ON DELETE SET NULL ON UPDATE CASCADE;
