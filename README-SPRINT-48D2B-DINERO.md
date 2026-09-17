# Sprint 48D-2B — Venta, Pago y Caja híbridos

Este bloque extiende el motor 48D para sincronizar operaciones monetarias sin replicar tablas completas.

## Eventos nuevos

- `VENTA.SNAPSHOT_V1`
- `PAGO.SNAPSHOT_V1`
- `CAJA.SNAPSHOT_V1`
- `MOVIMIENTO_CAJA.SNAPSHOT_V1`

Las relaciones distribuidas se resuelven por `globalId`; los `id` autoincrementales siguen siendo locales a cada base.

## Integración real

- `VentasService` encola la Venta al crearla.
- `registrarPago` encola Venta + Caja + el Pago creado dentro de la misma transacción.
- `CajasService` encola apertura/cierre de Caja y movimientos manuales.
- El Inbox aplica por `globalId` con upsert, de forma que un reenvío del mismo agregado no crea un segundo Pago o MovimientoCaja.

No se sincronizan todavía devoluciones, reversión, factura/documento electrónico ni inventario. Esos flujos requieren reglas de conflicto adicionales.

## Certificación

Desde la raíz, con 48D-1/48D-2A ya operativos:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\sigr-sync-smoke-up.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\certificar-sync-48d2b.ps1
```

La prueba:

1. prepara las mismas referencias en EDGE/CLOUD;
2. apaga temporalmente Cloud;
3. crea Caja + Venta pagada con 40.000 efectivo y 60.000 tarjeta en EDGE;
4. confirma que los eventos quedan pendientes;
5. recupera Cloud y sincroniza;
6. reencola los mismos agregados y confirma que siguen existiendo exactamente dos pagos;
7. crea un MovimientoCaja en Cloud;
8. EDGE lo recibe mediante pull/ACK;
9. ejecuta un ciclo adicional y confirma ausencia de duplicados.

Resultado esperado:

`SIGR SYNC 48D-2B OK`
