CREATE TABLE "UsuarioRol" (
    "usuarioId" INTEGER NOT NULL,
    "rolId" INTEGER NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UsuarioRol_pkey" PRIMARY KEY ("usuarioId", "rolId")
);

CREATE INDEX "UsuarioRol_rolId_idx" ON "UsuarioRol"("rolId");

ALTER TABLE "UsuarioRol"
ADD CONSTRAINT "UsuarioRol_usuarioId_fkey"
FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UsuarioRol"
ADD CONSTRAINT "UsuarioRol_rolId_fkey"
FOREIGN KEY ("rolId") REFERENCES "Rol"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "UsuarioRol" ("usuarioId", "rolId")
SELECT "id", "rolId" FROM "Usuario"
ON CONFLICT ("usuarioId", "rolId") DO NOTHING;
