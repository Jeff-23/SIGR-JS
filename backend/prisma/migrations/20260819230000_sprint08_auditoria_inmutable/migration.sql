-- CreateTable
CREATE TABLE "EventoAuditoria" (
    "id" BIGSERIAL NOT NULL,
    "accion" VARCHAR(80) NOT NULL,
    "recurso" VARCHAR(80) NOT NULL,
    "recursoId" VARCHAR(100),
    "actorEmail" VARCHAR(150) NOT NULL,
    "valoresAntes" JSONB,
    "valoresDespues" JSONB,
    "ip" VARCHAR(64),
    "agenteUsuario" VARCHAR(300),
    "correlacionId" VARCHAR(100) NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" INTEGER,
    "restauranteId" INTEGER,
    "sucursalId" INTEGER,

    CONSTRAINT "EventoAuditoria_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EventoAuditoria_restauranteId_creadoEn_idx" ON "EventoAuditoria"("restauranteId", "creadoEn");
CREATE INDEX "EventoAuditoria_sucursalId_creadoEn_idx" ON "EventoAuditoria"("sucursalId", "creadoEn");
CREATE INDEX "EventoAuditoria_actorId_creadoEn_idx" ON "EventoAuditoria"("actorId", "creadoEn");
CREATE INDEX "EventoAuditoria_recurso_recursoId_idx" ON "EventoAuditoria"("recurso", "recursoId");
CREATE INDEX "EventoAuditoria_accion_idx" ON "EventoAuditoria"("accion");
CREATE INDEX "EventoAuditoria_correlacionId_idx" ON "EventoAuditoria"("correlacionId");

ALTER TABLE "EventoAuditoria" ADD CONSTRAINT "EventoAuditoria_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EventoAuditoria" ADD CONSTRAINT "EventoAuditoria_restauranteId_fkey" FOREIGN KEY ("restauranteId") REFERENCES "Restaurante"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EventoAuditoria" ADD CONSTRAINT "EventoAuditoria_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "Permiso" ("codigo", "nombre", "modulo", "activo", "creadoEn")
VALUES ('AUDITORIA_VER', 'Consultar auditoria', 'AUDITORIA', true, CURRENT_TIMESTAMP)
ON CONFLICT ("codigo") DO UPDATE SET
  "nombre" = EXCLUDED."nombre",
  "modulo" = EXCLUDED."modulo",
  "activo" = true;

INSERT INTO "RolPermiso" ("rolId", "permisoId")
SELECT r."id", p."id"
FROM "Rol" r
CROSS JOIN "Permiso" p
WHERE r."ambito" = 'RESTAURANTE'
  AND r."nombre" = 'ADMIN'
  AND p."codigo" = 'AUDITORIA_VER'
ON CONFLICT DO NOTHING;
