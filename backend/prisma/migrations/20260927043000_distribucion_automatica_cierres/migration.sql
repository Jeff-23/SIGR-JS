-- Distribucion automatica de reportes de cierre.
-- La cola tecnica no registra ni expone politica de documentos internos.
CREATE TYPE "CanalEnvioReporteCierre" AS ENUM ('EMAIL', 'WHATSAPP');
CREATE TYPE "EstadoEnvioReporteCierre" AS ENUM ('PENDIENTE', 'ENVIANDO', 'ENVIADO', 'ERROR', 'PENDIENTE_CONFIGURACION');

CREATE TABLE "EnvioReporteCierre" (
    "id" SERIAL NOT NULL,
    "globalId" UUID NOT NULL,
    "canal" "CanalEnvioReporteCierre" NOT NULL,
    "destino" VARCHAR(200) NOT NULL,
    "estado" "EstadoEnvioReporteCierre" NOT NULL DEFAULT 'PENDIENTE',
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "proximoIntentoEn" TIMESTAMP(3),
    "ultimoIntentoEn" TIMESTAMP(3),
    "enviadoEn" TIMESTAMP(3),
    "errorCodigo" VARCHAR(80),
    "errorMensaje" VARCHAR(300),
    "preCierreHash" VARCHAR(64) NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,
    "cajaId" INTEGER NOT NULL,
    "sucursalId" INTEGER NOT NULL,
    "restauranteId" INTEGER NOT NULL,
    CONSTRAINT "EnvioReporteCierre_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EnvioReporteCierre_globalId_key" ON "EnvioReporteCierre"("globalId");
CREATE UNIQUE INDEX "EnvioReporteCierre_cajaId_canal_destino_preCierreHash_key" ON "EnvioReporteCierre"("cajaId", "canal", "destino", "preCierreHash");
CREATE INDEX "EnvioReporteCierre_estado_proximoIntentoEn_idx" ON "EnvioReporteCierre"("estado", "proximoIntentoEn");
CREATE INDEX "EnvioReporteCierre_sucursalId_creadoEn_idx" ON "EnvioReporteCierre"("sucursalId", "creadoEn");
CREATE INDEX "EnvioReporteCierre_restauranteId_creadoEn_idx" ON "EnvioReporteCierre"("restauranteId", "creadoEn");

ALTER TABLE "EnvioReporteCierre" ADD CONSTRAINT "EnvioReporteCierre_cajaId_fkey" FOREIGN KEY ("cajaId") REFERENCES "Caja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnvioReporteCierre" ADD CONSTRAINT "EnvioReporteCierre_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnvioReporteCierre" ADD CONSTRAINT "EnvioReporteCierre_restauranteId_fkey" FOREIGN KEY ("restauranteId") REFERENCES "Restaurante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
