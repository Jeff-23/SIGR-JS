CREATE TABLE "RestauranteMetodoPago" (
    "id" SERIAL NOT NULL,
    "restauranteId" INTEGER NOT NULL,
    "metodoPagoId" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RestauranteMetodoPago_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RestauranteMetodoPago_restauranteId_metodoPagoId_key"
ON "RestauranteMetodoPago"("restauranteId", "metodoPagoId");
CREATE INDEX "RestauranteMetodoPago_restauranteId_activo_idx"
ON "RestauranteMetodoPago"("restauranteId", "activo");
CREATE INDEX "RestauranteMetodoPago_metodoPagoId_idx"
ON "RestauranteMetodoPago"("metodoPagoId");

ALTER TABLE "RestauranteMetodoPago"
ADD CONSTRAINT "RestauranteMetodoPago_restauranteId_fkey"
FOREIGN KEY ("restauranteId") REFERENCES "Restaurante"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RestauranteMetodoPago"
ADD CONSTRAINT "RestauranteMetodoPago_metodoPagoId_fkey"
FOREIGN KEY ("metodoPagoId") REFERENCES "MetodoPago"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Cada restaurante activo inicia con los medios operativos estándar.
-- Los métodos OTRO de pruebas o integraciones no se habilitan automáticamente.
INSERT INTO "RestauranteMetodoPago" ("restauranteId", "metodoPagoId", "activo")
SELECT r."id", mp."id", true
FROM "Restaurante" r
CROSS JOIN "MetodoPago" mp
WHERE r."estado" = true
  AND mp."activo" = true
  AND mp."tipo" IN ('EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'QR')
ON CONFLICT ("restauranteId", "metodoPagoId") DO NOTHING;
