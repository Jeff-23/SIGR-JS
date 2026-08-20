-- Permisos para consultar y administrar la matriz de autorizacion.
INSERT INTO "Permiso" ("codigo", "nombre", "modulo", "activo", "creadoEn")
VALUES
  ('AUTORIZACION_VER', 'Ver planes, capacidades, roles y permisos', 'AUTORIZACION', true, CURRENT_TIMESTAMP),
  ('AUTORIZACION_GESTIONAR', 'Gestionar planes, capacidades, roles y permisos', 'AUTORIZACION', true, CURRENT_TIMESTAMP)
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
  AND p."codigo" IN ('AUTORIZACION_VER', 'AUTORIZACION_GESTIONAR')
ON CONFLICT DO NOTHING;
