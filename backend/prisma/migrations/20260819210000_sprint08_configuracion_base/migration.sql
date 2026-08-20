-- CreateTable
CREATE TABLE "ConfiguracionRestaurante" (
    "id" SERIAL NOT NULL,
    "clave" VARCHAR(60) NOT NULL,
    "valor" JSONB NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,
    "restauranteId" INTEGER NOT NULL,

    CONSTRAINT "ConfiguracionRestaurante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfiguracionSucursal" (
    "id" SERIAL NOT NULL,
    "clave" VARCHAR(60) NOT NULL,
    "valor" JSONB NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,
    "sucursalId" INTEGER NOT NULL,

    CONSTRAINT "ConfiguracionSucursal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConfiguracionRestaurante_restauranteId_idx" ON "ConfiguracionRestaurante"("restauranteId");
CREATE UNIQUE INDEX "ConfiguracionRestaurante_restauranteId_clave_key" ON "ConfiguracionRestaurante"("restauranteId", "clave");
CREATE INDEX "ConfiguracionSucursal_sucursalId_idx" ON "ConfiguracionSucursal"("sucursalId");
CREATE UNIQUE INDEX "ConfiguracionSucursal_sucursalId_clave_key" ON "ConfiguracionSucursal"("sucursalId", "clave");

-- AddForeignKey
ALTER TABLE "ConfiguracionRestaurante" ADD CONSTRAINT "ConfiguracionRestaurante_restauranteId_fkey" FOREIGN KEY ("restauranteId") REFERENCES "Restaurante"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConfiguracionSucursal" ADD CONSTRAINT "ConfiguracionSucursal_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Catalogo inicial de permisos. Los ADMIN existentes reciben ambos permisos.
INSERT INTO "Permiso" ("codigo", "nombre", "modulo", "activo", "creadoEn")
VALUES
  ('CONFIGURACION_VER', 'Ver configuracion operativa', 'CONFIGURACION', true, CURRENT_TIMESTAMP),
  ('CONFIGURACION_GESTIONAR', 'Gestionar configuracion operativa', 'CONFIGURACION', true, CURRENT_TIMESTAMP)
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
  AND p."codigo" IN ('CONFIGURACION_VER', 'CONFIGURACION_GESTIONAR')
ON CONFLICT DO NOTHING;
