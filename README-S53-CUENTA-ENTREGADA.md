# S53 — Solicitar cuenta sólo después de entregar el pedido

Parche preparado sobre el ZIP actual del repositorio con HEAD:

`2d9a49d feat: agregar entrega directa y despacho operativo sprint 53`

## Hallazgo

El backend de `solicitarCuenta()` comprobaba que existiera una venta preliminar, pero no comprobaba que el pedido hubiese sido entregado al cliente.

El flujo existente ya contiene una autoridad adecuada:

1. Las comandas pasan a `ENTREGADA` al retirarse de la estación.
2. El pedido puede marcarse `ENTREGADO` desde Salón únicamente cuando está `LISTO` y todas sus comandas activas fueron retiradas.
3. Por tanto, `EstadoPedido.ENTREGADO` es el punto seguro para habilitar `Solicitar cuenta`.

No se duplican reglas de KDS ni se recalculan manualmente las líneas en el endpoint de cuenta.

## Cambios

- Backend: `/pedidos/:id/solicitar-cuenta` rechaza pedidos cuyo estado no sea `ENTREGADO`.
- Frontend: `Solicitar cuenta` queda deshabilitado hasta `ENTREGADO`; muestra `Faltan entregas`.
- Contrato de Salón: helper `canRequestBill()`.
- Prueba focal: PENDIENTE, EN_PREPARACION y LISTO no permiten cuenta; ENTREGADO sí.
- Sin migraciones.
- Sin cambios en venta, pago, factura, impresión, inventario o sincronización.

## Prueba funcional

1. Pedido con Cocina + Despacho.
2. Marcar Despacho `LISTA`, pero no retirarlo: cuenta bloqueada.
3. Retirar Despacho y Cocina, pero no marcar `Entregado a mesa`: cuenta bloqueada.
4. Marcar `Entregado a mesa`: `Solicitar cuenta` se habilita.
5. Solicitar cuenta: mesa pasa a pendiente de pago.

