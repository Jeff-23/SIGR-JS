ALTER TYPE "EstadoDocumentoElectronico" ADD VALUE IF NOT EXISTS 'NUMERADO';
ALTER TYPE "EstadoDocumentoElectronico" ADD VALUE IF NOT EXISTS 'EN_COLA';

CREATE TYPE "AmbienteDian" AS ENUM ('HABILITACION', 'PRODUCCION');
CREATE TYPE "ModoOperacionDian" AS ENUM ('PROVEEDOR_TECNOLOGICO', 'SOFTWARE_PROPIO');
CREATE TYPE "TipoDocumentoFiscal" AS ENUM ('FACTURA_VENTA', 'NOTA_CREDITO', 'NOTA_DEBITO');
CREATE TYPE "EstadoOutboxFiscal" AS ENUM ('PENDIENTE', 'PROCESANDO', 'COMPLETADO', 'FALLIDO');

ALTER TABLE "DocumentoElectronico"
ADD COLUMN "tipo" "TipoDocumentoFiscal" NOT NULL DEFAULT 'FACTURA_VENTA',
ADD COLUMN "ambiente" "AmbienteDian",
ADD COLUMN "prefijo" VARCHAR(20),
ADD COLUMN "numeroFiscal" INTEGER,
ADD COLUMN "numeroCompleto" VARCHAR(50),
ADD COLUMN "solicitudProveedor" JSONB,
ADD COLUMN "xmlHash" VARCHAR(64),
ADD COLUMN "proveedorCodigo" VARCHAR(50),
ADD COLUMN "proveedorReferencia" VARCHAR(150),
ADD COLUMN "mensajeEstado" VARCHAR(500),
ADD COLUMN "resolucionId" INTEGER;

CREATE TABLE "PerfilFiscal" (
  "id" SERIAL PRIMARY KEY,
  "ambiente" "AmbienteDian" NOT NULL DEFAULT 'HABILITACION',
  "modoOperacion" "ModoOperacionDian" NOT NULL DEFAULT 'PROVEEDOR_TECNOLOGICO',
  "proveedorCodigo" VARCHAR(50), "responsabilidadFiscal" VARCHAR(20) NOT NULL,
  "municipioCodigo" VARCHAR(10) NOT NULL, "actividadEconomica" VARCHAR(20),
  "softwareIdRef" VARCHAR(150), "credencialRef" VARCHAR(150), "certificadoRef" VARCHAR(150),
  "activo" BOOLEAN NOT NULL DEFAULT false, "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizadoEn" TIMESTAMP(3) NOT NULL, "restauranteId" INTEGER NOT NULL UNIQUE,
  CONSTRAINT "PerfilFiscal_restauranteId_fkey" FOREIGN KEY ("restauranteId") REFERENCES "Restaurante"("id") ON DELETE RESTRICT
);

CREATE TABLE "ResolucionNumeracionDian" (
  "id" SERIAL PRIMARY KEY, "numeroResolucion" VARCHAR(100) NOT NULL, "prefijo" VARCHAR(20) NOT NULL,
  "rangoDesde" INTEGER NOT NULL, "rangoHasta" INTEGER NOT NULL, "siguienteNumero" INTEGER NOT NULL,
  "claveTecnicaRef" VARCHAR(150), "vigenteDesde" DATE NOT NULL, "vigenteHasta" DATE NOT NULL,
  "activa" BOOLEAN NOT NULL DEFAULT true, "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizadoEn" TIMESTAMP(3) NOT NULL, "restauranteId" INTEGER NOT NULL, "sucursalId" INTEGER,
  CONSTRAINT "ResolucionNumeracionDian_restauranteId_fkey" FOREIGN KEY ("restauranteId") REFERENCES "Restaurante"("id") ON DELETE RESTRICT,
  CONSTRAINT "ResolucionNumeracionDian_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT,
  CONSTRAINT "ResolucionNumeracionDian_restauranteId_prefijo_numeroResolucion_key" UNIQUE ("restauranteId", "prefijo", "numeroResolucion")
);

CREATE TABLE "OutboxFiscal" (
  "id" SERIAL PRIMARY KEY, "estado" "EstadoOutboxFiscal" NOT NULL DEFAULT 'PENDIENTE', "intentos" INTEGER NOT NULL DEFAULT 0,
  "disponibleEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "bloqueadoEn" TIMESTAMP(3), "ultimoError" VARCHAR(500),
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "actualizadoEn" TIMESTAMP(3) NOT NULL,
  "documentoId" INTEGER NOT NULL UNIQUE,
  CONSTRAINT "OutboxFiscal_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "DocumentoElectronico"("id") ON DELETE RESTRICT
);

CREATE TABLE "HistorialDocumentoFiscal" (
  "id" SERIAL PRIMARY KEY, "estado" "EstadoDocumentoElectronico" NOT NULL, "detalle" VARCHAR(500), "actorId" INTEGER,
  "correlacionId" VARCHAR(100), "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "documentoId" INTEGER NOT NULL,
  CONSTRAINT "HistorialDocumentoFiscal_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "DocumentoElectronico"("id") ON DELETE RESTRICT
);

ALTER TABLE "DocumentoElectronico" ADD CONSTRAINT "DocumentoElectronico_resolucionId_fkey" FOREIGN KEY ("resolucionId") REFERENCES "ResolucionNumeracionDian"("id") ON DELETE RESTRICT;
CREATE UNIQUE INDEX "DocumentoElectronico_resolucionId_numeroFiscal_key" ON "DocumentoElectronico"("resolucionId", "numeroFiscal");
CREATE INDEX "DocumentoElectronico_proveedorReferencia_idx" ON "DocumentoElectronico"("proveedorReferencia");
CREATE INDEX "ResolucionNumeracionDian_restauranteId_activa_idx" ON "ResolucionNumeracionDian"("restauranteId", "activa");
CREATE INDEX "ResolucionNumeracionDian_sucursalId_idx" ON "ResolucionNumeracionDian"("sucursalId");
CREATE INDEX "OutboxFiscal_estado_disponibleEn_idx" ON "OutboxFiscal"("estado", "disponibleEn");
CREATE INDEX "HistorialDocumentoFiscal_documentoId_creadoEn_idx" ON "HistorialDocumentoFiscal"("documentoId", "creadoEn");
