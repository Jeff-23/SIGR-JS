CREATE TABLE "PerfilCarta" (
  "id" SERIAL NOT NULL,
  "globalId" UUID NOT NULL DEFAULT gen_random_uuid(),
  "nombre" VARCHAR(100) NOT NULL,
  "descripcion" VARCHAR(220),
  "estado" BOOLEAN NOT NULL DEFAULT true,
  "predeterminada" BOOLEAN NOT NULL DEFAULT false,
  "orden" INTEGER NOT NULL DEFAULT 0,
  "modoActivacion" VARCHAR(20) NOT NULL DEFAULT 'SIEMPRE',
  "activoManual" BOOLEAN NOT NULL DEFAULT false,
  "horaInicio" VARCHAR(5),
  "horaFin" VARCHAR(5),
  "diasSemana" JSONB NOT NULL DEFAULT '[1,2,3,4,5,6,7]'::jsonb,
  "plantilla" JSONB NOT NULL,
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sucursalId" INTEGER NOT NULL,
  CONSTRAINT "PerfilCarta_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PerfilCarta_globalId_key" ON "PerfilCarta"("globalId");
CREATE INDEX "PerfilCarta_sucursalId_estado_orden_idx" ON "PerfilCarta"("sucursalId", "estado", "orden");
ALTER TABLE "PerfilCarta" ADD CONSTRAINT "PerfilCarta_sucursalId_fkey"
FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "PerfilCarta" (
  "nombre", "descripcion", "estado", "predeterminada", "orden",
  "modoActivacion", "activoManual", "horaInicio", "horaFin", "diasSemana",
  "plantilla", "sucursalId"
)
SELECT
  'Carta principal',
  'Perfil creado automáticamente desde la carta existente',
  true, true, 0, 'SIEMPRE', false, NULL, NULL, '[1,2,3,4,5,6,7]'::jsonb,
  COALESCE(
    (SELECT cs."valor" FROM "ConfiguracionSucursal" cs
      WHERE cs."sucursalId" = s."id" AND cs."clave" = 'CARTA_PLANTILLA' LIMIT 1),
    '{"titulo":"Menú","subtitulo":"","pie":"","estilo":"EDITORIAL_DORADO","mostrarPrecios":true,"fondoColor":"#F3EDE1","tarjetaColor":"#FFFDF8","textoColor":"#14283B","acentoColor":"#B98A2D","encabezadoColor":"#14283B","logoUrl":null,"fondoImagenUrl":null,"fondoImagenOpacidad":0.08,"secciones":[]}'::jsonb
  ) || '{"mostrarImagenesProductos":false}'::jsonb,
  s."id"
FROM "Sucursal" s;

ALTER TABLE "CartaDia" ADD COLUMN "perfilCartaId" INTEGER;
UPDATE "CartaDia" cd
SET "perfilCartaId" = pc."id"
FROM "PerfilCarta" pc
WHERE pc."sucursalId" = cd."sucursalId" AND pc."predeterminada" = true;

DROP INDEX IF EXISTS "CartaDia_sucursalId_fecha_key";
ALTER TABLE "CartaDia" ALTER COLUMN "perfilCartaId" SET NOT NULL;
ALTER TABLE "CartaDia" ADD CONSTRAINT "CartaDia_perfilCartaId_fkey"
FOREIGN KEY ("perfilCartaId") REFERENCES "PerfilCarta"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "CartaDia_perfilCartaId_fecha_key" ON "CartaDia"("perfilCartaId", "fecha");
