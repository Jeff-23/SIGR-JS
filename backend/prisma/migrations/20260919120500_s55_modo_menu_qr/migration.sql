-- S55: el pedido por QR pasa a ser opt-in. Las sucursales existentes
-- arrancan en modo informativo para que ningún cliente cree pedidos sin
-- habilitación explícita del restaurante.
INSERT INTO "ConfiguracionSucursal" (
  "clave",
  "valor",
  "creadoEn",
  "actualizadoEn",
  "sucursalId"
)
SELECT
  'QR_MODO',
  '"SOLO_MENU"'::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  s."id"
FROM "Sucursal" s
ON CONFLICT ("sucursalId", "clave") DO NOTHING;
