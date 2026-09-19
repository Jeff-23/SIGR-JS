-- Sprint 52 v3: los roles MESERO operativos deben poder crear y editar pedidos.
-- Esto habilita la unión de mesas antes de tomar el pedido sin conceder MESAS_EDITAR.
-- La autorización continúa siendo granular y estos permisos pueden revocarse después.
INSERT INTO "RolPermiso" ("rolId", "permisoId")
SELECT r."id", p."id"
FROM "Rol" r
JOIN "Permiso" p ON p."codigo" IN ('PEDIDOS_CREAR', 'PEDIDOS_EDITAR')
WHERE r."clave" LIKE 'RESTAURANTE:%:MESERO'
ON CONFLICT ("rolId", "permisoId") DO NOTHING;
