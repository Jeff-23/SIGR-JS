-- Fiscal A-B: preparación multiempresa para Software Propio / MATÍAS.
-- Migración idempotente para permitir recuperación segura si una ejecución previa quedó fallida.
-- No activa transmisión real ni contiene credenciales.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TipoNumeracionDian') THEN
    CREATE TYPE "TipoNumeracionDian" AS ENUM (
      'FACTURA_ELECTRONICA_VENTA',
      'DOCUMENTO_EQUIVALENTE_ELECTRONICO_POS'
    );
  END IF;
END $$;

ALTER TYPE "TipoDocumentoFiscal"
  ADD VALUE IF NOT EXISTS 'DOCUMENTO_EQUIVALENTE_POS';

ALTER TABLE "PerfilFiscal"
  ADD COLUMN IF NOT EXISTS "pinSoftwareRef" VARCHAR(150),
  ADD COLUMN IF NOT EXISTS "cuentaProveedorRef" VARCHAR(150);

ALTER TABLE "ResolucionNumeracionDian"
  ADD COLUMN IF NOT EXISTS "tipoNumeracion" "TipoNumeracionDian" NOT NULL DEFAULT 'FACTURA_ELECTRONICA_VENTA',
  ADD COLUMN IF NOT EXISTS "fechaAutorizacion" DATE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "ResolucionNumeracionDian"
    WHERE length("prefijo") > 4
  ) THEN
    RAISE EXCEPTION 'Existen prefijos DIAN de más de 4 caracteres. Corrígelos antes de aplicar la migración fiscal MATÍAS.';
  END IF;
END $$;

ALTER TABLE "ResolucionNumeracionDian"
  ALTER COLUMN "prefijo" TYPE VARCHAR(4);

-- El antiguo @@unique de Prisma se creó como CONSTRAINT, no como índice independiente.
-- PostgreSQL no permite DROP INDEX sobre el índice que respalda una restricción UNIQUE.
ALTER TABLE "ResolucionNumeracionDian"
  DROP CONSTRAINT IF EXISTS "ResolucionNumeracionDian_restauranteId_prefijo_numeroResolucion_key",
  DROP CONSTRAINT IF EXISTS "ResolucionNumeracionDian_restauranteId_prefijo_numeroResolu_key";

DROP INDEX IF EXISTS "ResolucionNumeracionDian_restauranteId_prefijo_numeroResolucion_key";
DROP INDEX IF EXISTS "ResolucionNumeracionDian_restauranteId_prefijo_numeroResolu_key";
DROP INDEX IF EXISTS "ResolucionNumeracionDian_restauranteId_activa_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "ResolucionNumeracionDian_rest_tipo_prefijo_resol_key"
  ON "ResolucionNumeracionDian"("restauranteId", "tipoNumeracion", "prefijo", "numeroResolucion");

CREATE INDEX IF NOT EXISTS "ResolucionNumeracionDian_rest_tipo_activa_idx"
  ON "ResolucionNumeracionDian"("restauranteId", "tipoNumeracion", "activa");
