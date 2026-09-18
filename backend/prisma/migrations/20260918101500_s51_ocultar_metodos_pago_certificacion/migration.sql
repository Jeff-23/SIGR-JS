-- Sprint 51: los métodos de pago creados por certificaciones de sincronización
-- son datos técnicos y no deben aparecer como opciones operativas de Caja.
-- Se conservan para integridad histórica de pagos y pruebas ya registradas.
UPDATE "MetodoPago"
SET "activo" = false
WHERE "nombre" LIKE 'Efectivo Sync %'
   OR "nombre" LIKE 'Tarjeta Sync %';
