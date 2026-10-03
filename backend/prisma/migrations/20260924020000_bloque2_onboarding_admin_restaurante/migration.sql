-- Repara restaurantes activos creados antes de que el alta provisionara
-- automáticamente su rol ADMIN protegido. No modifica roles ADMIN existentes.
WITH nuevos_roles AS (
  INSERT INTO "Rol" (
    "clave",
    "nombre",
    "descripcion",
    "ambito",
    "restauranteId"
  )
  SELECT
    'RESTAURANTE:' || restaurante."id" || ':ADMIN',
    'ADMIN',
    'Administrador del restaurante ' || restaurante."nombre",
    'RESTAURANTE'::"AmbitoRol",
    restaurante."id"
  FROM "Restaurante" AS restaurante
  WHERE restaurante."estado" = true
    AND NOT EXISTS (
      SELECT 1
      FROM "Rol" AS rol
      WHERE rol."restauranteId" = restaurante."id"
        AND (
          rol."clave" = 'RESTAURANTE:' || restaurante."id" || ':ADMIN'
          OR rol."nombre" = 'ADMIN'
        )
    )
  RETURNING "id"
)
INSERT INTO "RolPermiso" ("rolId", "permisoId")
SELECT nuevos_roles."id", permiso."id"
FROM nuevos_roles
CROSS JOIN "Permiso" AS permiso
WHERE permiso."activo" = true
ON CONFLICT DO NOTHING;
