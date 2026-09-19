INSERT INTO "Permiso" ("codigo", "nombre", "modulo", "activo", "creadoEn")
VALUES ('COMANDAS_IMPRIMIR', 'Imprimir comandas', 'KDS', true, CURRENT_TIMESTAMP)
ON CONFLICT ("codigo") DO UPDATE
SET "nombre" = EXCLUDED."nombre",
    "modulo" = EXCLUDED."modulo",
    "activo" = true;

INSERT INTO "RolPermiso" ("rolId", "permisoId")
SELECT r."id", p."id"
FROM "Rol" r
JOIN "Permiso" p ON p."codigo" = 'COMANDAS_IMPRIMIR'
WHERE r."clave" LIKE 'RESTAURANTE:%:ADMIN'
   OR r."clave" LIKE 'RESTAURANTE:%:ADMIN_SEDE'
   OR r."clave" LIKE 'RESTAURANTE:%:CAJERO'
ON CONFLICT ("rolId", "permisoId") DO NOTHING;

DELETE FROM "RolPermiso" rp
USING "Rol" r, "Permiso" p
WHERE rp."rolId" = r."id"
  AND rp."permisoId" = p."id"
  AND p."codigo" = 'COMANDAS_IMPRIMIR'
  AND r."clave" LIKE 'RESTAURANTE:%:%'
  AND r."clave" NOT LIKE 'RESTAURANTE:%:ADMIN'
  AND r."clave" NOT LIKE 'RESTAURANTE:%:ADMIN_SEDE'
  AND r."clave" NOT LIKE 'RESTAURANTE:%:CAJERO';
