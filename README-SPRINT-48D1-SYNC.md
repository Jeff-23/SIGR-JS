# Sprint 48D-1 — Outbox / Inbox y transporte EDGE → Cloud → EDGE

Este bloque crea la infraestructura de sincronización híbrida sin conectar todavía entidades comerciales reales.

## Decisión de arquitectura importante

Cloud **no abre conexiones hacia el PC del restaurante**. El EDGE (SIGR Local Node) inicia todas las conexiones salientes hacia Cloud:

1. EDGE hace **push** de su Outbox a Cloud.
2. EDGE hace **pull** de eventos que Cloud tenga destinados a ese nodo.
3. EDGE aplica en Inbox y envía **ACK**.
4. Si Internet cae, los eventos permanecen pendientes y se reintentan al volver la conectividad.

Esto evita port-forwarding, IP pública, VPN obligatoria o exponer el PC del restaurante a Internet.

## Tablas nuevas

- `SyncPeer`: registra cada nodo EDGE autorizado en Cloud con clave almacenada como SHA-256 y alcance futuro por restaurante/sucursal.
- `SyncOutbox`: cola durable de eventos salientes.
- `SyncInbox`: registro idempotente de eventos recibidos.

Cada evento contiene `eventId` UUID global, nodo origen/destino, `globalId` opcionales de restaurante/sucursal/agregado, versión de esquema, payload, SHA-256 del payload y timestamps UTC.

## Garantías implementadas

- Un `eventId` se aplica una sola vez.
- Repetir exactamente el mismo evento devuelve `DUPLICATE`.
- Reutilizar el mismo `eventId` con otro payload devuelve `CONFLICT`.
- Outbox sólo pasa a `SINCRONIZADO` después de respuesta/ACK.
- Reintentos tienen backoff y los `ENVIANDO` abandonados tienen lease recuperable.
- El envío se procesa en orden ascendente de Outbox.
- Cloud autentica cada EDGE mediante `nodeId + clave propia del nodo`; no hay una clave global compartida entre todos los restaurantes.
- Si un `SyncPeer` tiene restaurante/sucursal asignados, Cloud rechaza eventos fuera de ese alcance.
- Los endpoints de certificación desaparecen efectivamente (`404`) cuando `SYNC_CERTIFICATION_ENABLED=false`.

## Outbox transaccional

`SyncOutboxService.encolar()` acepta un `Prisma.TransactionClient`. En 48D-2 los servicios de Pedido, Venta, Pago, etc. deberán guardar el cambio de negocio y su evento Outbox dentro de la misma transacción.

No se sincronizan tablas completas.

## Qué aplica 48D-1

Sólo existe un handler inocuo: `SYNC.PING`. Sirve para certificar transporte e idempotencia sin modificar pedidos, ventas, pagos, inventario ni caja.

**48D-1 todavía NO significa que pedidos/ventas/pagos estén sincronizando.** Eso se conecta por dominio en 48D-2 y después se certifican los conflictos en 48E.

## Certificación local

Requiere 48B y 48C ya configurados.

Desde la raíz:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\configurar-sync-smoke.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\sigr-sync-smoke-up.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\certificar-sync-48d1.ps1
```

Resultado esperado:

```text
SIGR SYNC 48D-1 OK
Idempotencia, colision, outbox, inbox, pull y ACK certificados.
```

La prueba usa:

- EDGE: `http://localhost:8080`
- Cloud Smoke: `http://localhost:8081`

El HTTP sólo corresponde a la certificación local. El EDGE real se configurará contra Cloud por HTTPS.
