# S53 — Fix liberación de mesa tras pago completo

## Diagnóstico

La captura posterior al pago muestra el patrón exacto del fallo:

- la venta ya quedó `PAGADA`, por eso el pedido deja de mostrarse en la tarjeta;
- la mesa permanece `OCUPADA`.

El pago completo sólo liberaba mesas cuyo estado fuera exactamente `PENDIENTE_PAGO`.
Si por cualquier desincronización la mesa llegaba al cobro todavía como `OCUPADA`,
la venta cerraba correctamente pero la ocupación quedaba huérfana.

## Corrección

Al completar el pago:

- sólo se libera si `pedido.estado === ENTREGADO`;
- se liberan mesas que estén `OCUPADA` **o** `PENDIENTE_PAGO`;
- se incluyen la mesa principal y las mesas vinculadas;
- un pago anticipado de un pedido no entregado **no libera** la mesa.

No se modifica:

- la regla de `Solicitar cuenta`;
- preparación/KDS;
- inventario;
- factura;
- pagos parciales;
- Prisma/migraciones;
- frontend.

## Prueba funcional

1. Pedido con productos entregados.
2. `Entregado a mesa`.
3. `Solicitar cuenta`.
4. Cobrar el total.
5. La venta debe quedar `PAGADA`.
6. La mesa debe pasar inmediatamente a `LIBRE`.

