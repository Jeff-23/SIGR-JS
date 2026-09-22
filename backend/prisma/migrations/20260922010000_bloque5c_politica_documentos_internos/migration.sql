-- Bloque 5C: autorización granular para participar en exclusiones de documentos
-- internos durante el cierre. El permiso NO se concede automáticamente a CAJERO:
-- el ADMIN del restaurante decide qué rol/cajero lo recibe.
INSERT INTO "Permiso" ("codigo", "nombre", "descripcion", "modulo", "activo", "creadoEn")
VALUES (
  'DOCUMENTOS_INTERNOS_EXCLUIR_CIERRE',
  'Excluir documentos internos durante cierre',
  'Permite participar en el flujo de exclusión de documentos internos durante el cierre cuando la plataforma haya habilitado el modo FLEXIBLE.',
  'FACTURACION',
  true,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("codigo") DO UPDATE
SET "nombre" = EXCLUDED."nombre",
    "descripcion" = EXCLUDED."descripcion",
    "modulo" = EXCLUDED."modulo",
    "activo" = true;

-- El administrador del restaurante puede gestionar el permiso. No se entrega a
-- CAJERO por defecto: debe concederse de forma explícita desde Roles y permisos.
INSERT INTO "RolPermiso" ("rolId", "permisoId")
SELECT r."id", p."id"
FROM "Rol" r
JOIN "Permiso" p ON p."codigo" = 'DOCUMENTOS_INTERNOS_EXCLUIR_CIERRE'
WHERE r."clave" LIKE 'RESTAURANTE:%:ADMIN'
ON CONFLICT ("rolId", "permisoId") DO NOTHING;
