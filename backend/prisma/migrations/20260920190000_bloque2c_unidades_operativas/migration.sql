CREATE TABLE "UnidadOperativa" (
  "id" SERIAL NOT NULL,
  "globalId" UUID NOT NULL DEFAULT gen_random_uuid(),
  "nombre" VARCHAR(100) NOT NULL,
  "descripcion" VARCHAR(220),
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "orden" INTEGER NOT NULL DEFAULT 0,
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sucursalId" INTEGER NOT NULL,
  CONSTRAINT "UnidadOperativa_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmpleadoUnidadOperativa" (
  "empleadoId" INTEGER NOT NULL,
  "unidadOperativaId" INTEGER NOT NULL,
  "principal" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "EmpleadoUnidadOperativa_pkey" PRIMARY KEY ("empleadoId", "unidadOperativaId")
);

ALTER TABLE "TurnoPersonal" ADD COLUMN "unidadOperativaId" INTEGER;

CREATE UNIQUE INDEX "UnidadOperativa_globalId_key" ON "UnidadOperativa"("globalId");
CREATE UNIQUE INDEX "UnidadOperativa_sucursalId_nombre_key" ON "UnidadOperativa"("sucursalId", "nombre");
CREATE INDEX "UnidadOperativa_sucursalId_activo_orden_idx" ON "UnidadOperativa"("sucursalId", "activo", "orden");
CREATE INDEX "EmpleadoUnidadOperativa_unidadOperativaId_empleadoId_idx" ON "EmpleadoUnidadOperativa"("unidadOperativaId", "empleadoId");
CREATE INDEX "TurnoPersonal_unidadOperativaId_inicioProgramado_idx" ON "TurnoPersonal"("unidadOperativaId", "inicioProgramado");

ALTER TABLE "UnidadOperativa" ADD CONSTRAINT "UnidadOperativa_sucursalId_fkey"
FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmpleadoUnidadOperativa" ADD CONSTRAINT "EmpleadoUnidadOperativa_empleadoId_fkey"
FOREIGN KEY ("empleadoId") REFERENCES "Empleado"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmpleadoUnidadOperativa" ADD CONSTRAINT "EmpleadoUnidadOperativa_unidadOperativaId_fkey"
FOREIGN KEY ("unidadOperativaId") REFERENCES "UnidadOperativa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TurnoPersonal" ADD CONSTRAINT "TurnoPersonal_unidadOperativaId_fkey"
FOREIGN KEY ("unidadOperativaId") REFERENCES "UnidadOperativa"("id") ON DELETE SET NULL ON UPDATE CASCADE;
