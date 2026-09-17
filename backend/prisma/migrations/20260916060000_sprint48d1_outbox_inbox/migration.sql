-- Sprint 48D-1: infraestructura transaccional outbox/inbox.
CREATE TYPE "RolNodoSync" AS ENUM ('EDGE', 'CLOUD');
CREATE TYPE "EstadoSyncOutbox" AS ENUM ('PENDIENTE', 'ENVIANDO', 'SINCRONIZADO', 'ERROR');
CREATE TYPE "EstadoSyncInbox" AS ENUM ('RECIBIDO', 'APLICADO', 'ERROR');

CREATE TABLE "SyncPeer" (
    "id" SERIAL NOT NULL,
    "nodeId" VARCHAR(120) NOT NULL,
    "nombre" VARCHAR(160),
    "rol" "RolNodoSync" NOT NULL,
    "claveHash" VARCHAR(64) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "restauranteGlobalId" UUID,
    "sucursalGlobalId" UUID,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,
    "ultimoAccesoEn" TIMESTAMP(3),
    CONSTRAINT "SyncPeer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SyncOutbox" (
    "id" SERIAL NOT NULL,
    "eventId" UUID NOT NULL,
    "nodoOrigenId" VARCHAR(120) NOT NULL,
    "nodoDestinoId" VARCHAR(120) NOT NULL,
    "restauranteGlobalId" UUID,
    "sucursalGlobalId" UUID,
    "tipoAgregado" VARCHAR(100) NOT NULL,
    "agregadoGlobalId" UUID,
    "tipoEvento" VARCHAR(140) NOT NULL,
    "versionEsquema" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "payloadHash" VARCHAR(64) NOT NULL,
    "ocurridoEn" TIMESTAMP(3) NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estado" "EstadoSyncOutbox" NOT NULL DEFAULT 'PENDIENTE',
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "ultimoIntentoEn" TIMESTAMP(3),
    "proximoIntentoEn" TIMESTAMP(3),
    "sincronizadoEn" TIMESTAMP(3),
    "ultimoError" VARCHAR(1000),
    CONSTRAINT "SyncOutbox_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SyncInbox" (
    "id" SERIAL NOT NULL,
    "eventId" UUID NOT NULL,
    "nodoOrigenId" VARCHAR(120) NOT NULL,
    "restauranteGlobalId" UUID,
    "sucursalGlobalId" UUID,
    "tipoAgregado" VARCHAR(100) NOT NULL,
    "agregadoGlobalId" UUID,
    "tipoEvento" VARCHAR(140) NOT NULL,
    "versionEsquema" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "payloadHash" VARCHAR(64) NOT NULL,
    "ocurridoEn" TIMESTAMP(3) NOT NULL,
    "recibidoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aplicadoEn" TIMESTAMP(3),
    "estado" "EstadoSyncInbox" NOT NULL DEFAULT 'RECIBIDO',
    "ultimoError" VARCHAR(1000),
    CONSTRAINT "SyncInbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SyncPeer_nodeId_key" ON "SyncPeer"("nodeId");
CREATE INDEX "SyncPeer_activo_rol_idx" ON "SyncPeer"("activo", "rol");
CREATE INDEX "SyncPeer_restauranteGlobalId_idx" ON "SyncPeer"("restauranteGlobalId");
CREATE INDEX "SyncPeer_sucursalGlobalId_idx" ON "SyncPeer"("sucursalGlobalId");

CREATE UNIQUE INDEX "SyncOutbox_eventId_key" ON "SyncOutbox"("eventId");
CREATE INDEX "SyncOutbox_estado_proximoIntentoEn_id_idx" ON "SyncOutbox"("estado", "proximoIntentoEn", "id");
CREATE INDEX "SyncOutbox_nodoDestinoId_estado_id_idx" ON "SyncOutbox"("nodoDestinoId", "estado", "id");
CREATE INDEX "SyncOutbox_sucursalGlobalId_id_idx" ON "SyncOutbox"("sucursalGlobalId", "id");
CREATE INDEX "SyncOutbox_tipoAgregado_agregadoGlobalId_idx" ON "SyncOutbox"("tipoAgregado", "agregadoGlobalId");

CREATE UNIQUE INDEX "SyncInbox_eventId_key" ON "SyncInbox"("eventId");
CREATE INDEX "SyncInbox_nodoOrigenId_recibidoEn_idx" ON "SyncInbox"("nodoOrigenId", "recibidoEn");
CREATE INDEX "SyncInbox_sucursalGlobalId_recibidoEn_idx" ON "SyncInbox"("sucursalGlobalId", "recibidoEn");
CREATE INDEX "SyncInbox_estado_recibidoEn_idx" ON "SyncInbox"("estado", "recibidoEn");
CREATE INDEX "SyncInbox_tipoAgregado_agregadoGlobalId_idx" ON "SyncInbox"("tipoAgregado", "agregadoGlobalId");
