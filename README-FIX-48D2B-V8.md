# Fix 48D-2B v8 — Pull Cloud -> EDGE at-least-once

Corrección del tramo que seguía fallando después de confirmar que el evento existe en Cloud como `PENDIENTE` y está dirigido a `edge-dev`, pero `/pull` devuelve 0.

## Cambio
- Cloud ya no "reclama" eventos de pull antes del ACK.
- `/sync/internal/pull` lista directamente eventos destinados al EDGE y los mantiene pendientes hasta `/ack`.
- Si el mismo evento se entrega dos veces, `SyncInbox` lo trata de forma idempotente por `eventId`.
- Se mantienen `tomarParaEnvio()` y sus claims para el PUSH EDGE -> CLOUD.
- También se pueden recuperar eventos que hayan quedado `ENVIANDO` por versiones anteriores.

No modifica Prisma, migraciones, Caja, Venta, Pago ni MovimientoCaja.
