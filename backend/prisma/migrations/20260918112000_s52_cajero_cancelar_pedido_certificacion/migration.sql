-- Sprint 52: los roles CAJERO creados por el seed de certificación deben poder
-- cancelar pedidos operativos por error. La autorización sigue siendo granular:
-- el endpoint mantiene PEDIDOS_CANCELAR y el permiso puede revocarse después.
INSERT INTO "RolPermiso" ("rolId", "permisoId")
SELECT r."id", p."id"
FROM "Rol" r
JOIN "Permiso" p ON p."codigo" = 'PEDIDOS_CANCELAR'
WHERE r."clave" LIKE 'RESTAURANTE:%:CAJERO'
ON CONFLICT ("rolId", "permisoId") DO NOTHING;
