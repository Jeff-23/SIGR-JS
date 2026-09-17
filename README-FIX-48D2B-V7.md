# Fix 48D-2B v7

Basado en los cuatro archivos vivos entregados desde el repositorio actual.

## Correccion
- Sustituye el claim SERIALIZABLE por claim atomico por fila en SyncOutboxService.
- Un evento PENDIENTE dirigido al peer se considera elegible inmediatamente.
- Evita que una colision/cancelacion de la transaccion completa se degrade silenciosamente a `fetched=0`.
- Mantiene proteccion contra doble consumidor mediante updateMany condicionado por estado/lease original.
- El transporte devuelve `pullError` en diagnostico si el endpoint pull vuelve a fallar.

No cambia Prisma, esquema, datos de negocio, Caja, Venta, Pago ni MovimientoCaja.
