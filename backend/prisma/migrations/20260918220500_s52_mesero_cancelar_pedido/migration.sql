-- Sprint 52 v4: los roles MESERO operativos pueden cancelar un pedido creado por error.
-- El backend mantiene la regla de negocio: solo antes de que la preparación avance.
INSERT INTO "RolPermiso" ("rolId", "permisoId")
SELECT r."id", p."id"
FROM "Rol" r
JOIN "Permiso" p ON p."codigo" = 'PEDIDOS_CANCELAR'
WHERE r."clave" LIKE 'RESTAURANTE:%:MESERO'
ON CONFLICT ("rolId", "permisoId") DO NOTHING;
