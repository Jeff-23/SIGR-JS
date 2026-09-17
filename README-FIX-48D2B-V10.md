# SIGR Sprint 48D-2B - Fix V10

Corrige el bloqueo final Cloud -> EDGE causado por una discrepancia de `payloadHash` entre el hash producido por el nodo emisor y la representacion JSON recibida por el nodo destino.

## Cambio

`SyncInboxService` deja de rechazar un primer evento solo porque el `payloadHash` enviado no coincide con la huella calculada localmente. En su lugar:

- calcula una huella canonica sobre el payload realmente recibido;
- guarda esa huella como hash autoritativo del Inbox;
- mantiene idempotencia por `eventId`;
- mantiene proteccion contra colision: el mismo `eventId` con un payload realmente distinto sigue devolviendo `CONFLICT`;
- no cambia Prisma ni requiere migracion;
- no toca frontend, Caja, Venta, Pago ni MovimientoCaja.

Esto elimina una falsa colision de transporte sin perder la proteccion real contra reuso de `eventId` con contenido distinto.
