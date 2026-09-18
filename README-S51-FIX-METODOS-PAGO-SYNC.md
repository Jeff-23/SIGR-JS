# Sprint 51 - Fix medios de pago técnicos de certificación

## Problema
Las certificaciones de sincronización 48D/48D2B crean métodos globales con nombres `Efectivo Sync ...` y `Tarjeta Sync ...`. Como quedaban `activo=true`, el endpoint operativo `/metodos-pago` los devolvía a Caja junto con Efectivo, Tarjeta, Transferencia y QR.

## Corrección
- Migración de datos: desactiva únicamente los métodos cuyo nombre comienza por `Efectivo Sync ` o `Tarjeta Sync `.
- Los registros no se eliminan, para preservar pagos históricos, integridad referencial y evidencia de certificación.
- Las certificaciones futuras crearán/actualizarán esos métodos con `activo=false`, evitando que vuelvan a aparecer en Caja.
- No cambia pagos existentes, ventas, caja ni métodos comerciales normales.

## Verificación esperada
Después de aplicar la migración, `/metodos-pago` seguirá devolviendo sólo registros activos; por tanto, los métodos técnicos dejan de mostrarse sin agregar lógica especial al frontend.
