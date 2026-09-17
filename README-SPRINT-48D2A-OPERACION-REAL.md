# Sprint 48D-2A — Pedido + Comanda + Domicilio reales

Este bloque conecta el motor Outbox/Inbox certificado en 48D-1 con datos operativos reales, sin tocar todavía Venta, Pago, Caja ni Inventario.

## Eventos
- `PEDIDO.SNAPSHOT_V1`
- `COMANDA.SNAPSHOT_V1`
- `DOMICILIO.SNAPSHOT_V1`

Los snapshots usan `globalId` y referencias por `globalId`; los IDs numéricos locales no se comparten entre EDGE y CLOUD.

## Garantías de este bloque
- El evento de negocio se encola dentro de la misma transacción Prisma que la operación local en los flujos conectados.
- Pedido/DetallePedido se reconstruyen por `globalId` sin duplicarlos.
- Comanda/DetalleComanda se reconstruyen por `globalId` y respetan Pedido/Estación.
- Domicilio se vincula al Pedido por `globalId`.
- Se valida restaurante/sucursal del envelope antes de aplicar.
- El Inbox de 48D-1 sigue garantizando `eventId` idempotente y hash de payload.
- CLOUD puede emitir hacia el EDGE asociado a la sucursal; EDGE sigue iniciando la comunicación mediante pull/ACK.

## Flujos conectados en código
- crear Pedido (incluido Domicilio inicial)
- agregar líneas a Pedido
- actualizar una línea de Pedido antes de cocina
- crear Comanda
- iniciar Comanda completa
- actualizar estado de línea de Comanda
- actualizar estado de Comanda
- actualizar estado de Domicilio

No se habilitan todavía conflictos simultáneos avanzados. Las reglas de conflicto pertenecen a 48E.

## Certificación
Con 48A–48D1 ya levantados/configurados:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\sigr-sync-smoke-up.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\certificar-sync-48d2a.ps1
```

La prueba detiene temporalmente el backend CLOUD, crea Pedido + Detalle + Domicilio + Comanda en EDGE, comprueba que la Outbox conserva los eventos, recupera CLOUD, sincroniza EDGE→CLOUD, genera cambios reales en CLOUD, hace pull CLOUD→EDGE y comprueba que no aparezcan duplicados.

Resultado esperado:

```text
SIGR SYNC 48D-2A OK
```

## Fuera de alcance
- Venta
- Pago
- Factura / documento electrónico
- Caja
- Inventario
- resolución de conflictos concurrentes complejos
