CREATE TYPE "TipoConflictoSync" AS ENUM ('COLISION_EVENT_ID', 'APLICACION_EVENTO');
CREATE TYPE "EstadoConflictoSync" AS ENUM ('ABIERTO', 'RESUELTO', 'DESCARTADO');

CREATE TABLE "SyncConflicto" (
    "id" BIGSERIAL NOT NULL,
    "conflictoId" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "nodoOrigenId" VARCHAR(120) NOT NULL,
    "nodoDestinoId" VARCHAR(120) NOT NULL,
    "restauranteGlobalId" UUID,
    "sucursalGlobalId" UUID,
    "tipoAgregado" VARCHAR(100) NOT NULL,
    "agregadoGlobalId" UUID,
    "tipoEvento" VARCHAR(140) NOT NULL,
    "tipo" "TipoConflictoSync" NOT NULL,
    "razon" VARCHAR(1000) NOT NULL,
    "payloadHashRecibido" VARCHAR(64) NOT NULL,
    "payloadHashExistente" VARCHAR(64),
    "estado" "EstadoConflictoSync" NOT NULL DEFAULT 'ABIERTO',
    "resolucion" VARCHAR(1000),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,
    "resueltoEn" TIMESTAMP(3),
    CONSTRAINT "SyncConflicto_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SyncConflicto_conflictoId_key" ON "SyncConflicto"("conflictoId");
CREATE UNIQUE INDEX "SyncConflicto_eventId_tipo_payloadHashRecibido_key" ON "SyncConflicto"("eventId", "tipo", "payloadHashRecibido");
CREATE INDEX "SyncConflicto_estado_creadoEn_idx" ON "SyncConflicto"("estado", "creadoEn");
CREATE INDEX "SyncConflicto_restauranteGlobalId_estado_creadoEn_idx" ON "SyncConflicto"("restauranteGlobalId", "estado", "creadoEn");
CREATE INDEX "SyncConflicto_sucursalGlobalId_estado_creadoEn_idx" ON "SyncConflicto"("sucursalGlobalId", "estado", "creadoEn");
CREATE INDEX "SyncConflicto_tipoAgregado_agregadoGlobalId_creadoEn_idx" ON "SyncConflicto"("tipoAgregado", "agregadoGlobalId", "creadoEn");

INSERT INTO "Permiso" ("codigo", "nombre", "modulo", "activo", "creadoEn")
VALUES ('SYNC_CONFLICTOS_GESTIONAR', 'Gestionar conflictos de sincronizacion', 'SINCRONIZACION', true, CURRENT_TIMESTAMP)
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
  AND p."codigo" = 'SYNC_CONFLICTOS_GESTIONAR'
ON CONFLICT DO NOTHING;
