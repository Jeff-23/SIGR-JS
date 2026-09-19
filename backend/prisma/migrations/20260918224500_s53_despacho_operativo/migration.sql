-- S53: estación operativa para bebidas y productos de entrega directa.
-- El globalId se deriva del globalId de la sucursal para que EDGE/CLOUD
-- obtengan la misma identidad lógica al aplicar la misma migración.

INSERT INTO "EstacionPreparacion" (
  "globalId",
  "codigo",
  "nombre",
  "color",
  "orden",
  "objetivoPreparacionMin",
  "modoOperacion",
  "estado",
  "sucursalId"
)
SELECT
  (
    substr(md5('S53:DESPACHO:' || s."globalId"::text), 1, 8) || '-' ||
    substr(md5('S53:DESPACHO:' || s."globalId"::text), 9, 4) || '-' ||
    substr(md5('S53:DESPACHO:' || s."globalId"::text), 13, 4) || '-' ||
    substr(md5('S53:DESPACHO:' || s."globalId"::text), 17, 4) || '-' ||
    substr(md5('S53:DESPACHO:' || s."globalId"::text), 21, 12)
  )::uuid,
  'DESPACHO',
  'Despacho',
  '#8B5CF6',
  30,
  5,
  'KDS_E_IMPRESION',
  true,
  s."id"
FROM "Sucursal" s
WHERE NOT EXISTS (
  SELECT 1
  FROM "EstacionPreparacion" e
  WHERE e."sucursalId" = s."id"
    AND e."codigo" = 'DESPACHO'
);
