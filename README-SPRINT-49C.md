# Sprint 49C — Saneamiento operativo de sincronización

## Objetivo

Convertir el diagnóstico de 49A/49B en acciones seguras de soporte para reducir errores recuperables sin borrar registros, editar payloads ni entrar directamente a PostgreSQL.

## Alcance implementado

- Outbox ERROR ahora identifica la causa resumida: `TRANSPORTE`, `RECHAZO_PEER` u `OTRO`.
- Se conserva el reintento unitario de 49B.
- Se añade saneamiento por lote pequeño (máximo 25) **exclusivamente** para errores transitorios de transporte y destinos activos.
- HTTP 400/403, destinos históricos y errores no clasificados no entran en el saneamiento masivo.
- Inbox ERROR permite reaplicación administrativa de **un solo evento** cuando el tipo sigue soportado.
- Los Inbox cuyo error indica `Tipo de evento no soportado` quedan bloqueados hasta actualizar el sistema.
- Los listados mantienen payload/hash/claves fuera del contrato administrativo.
- `total` representa el conteo real aunque el detalle siga limitado a los 200 registros más recientes.

## Seguridad

Las acciones productivas requieren JWT, alcance multiempresa/multisucursal y permiso `SYNC_CONFLICTOS_GESTIONAR`. Los endpoints internos usados por el certificador siguen protegidos por `SyncCertGuard` y sólo existen para la topología de certificación.

## Lo que 49C no hace

No elimina Outbox/Inbox reales, no modifica payloads, no marca errores como sincronizados artificialmente, no fuerza resolución de conflictos y no reintenta en masa rechazos de negocio o de alcance del peer.

## Certificación

Ejecutar desde la raíz:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\certificar-sync-49c.ps1
```

Cierre esperado:

```text
SIGR SYNC 49C SANEAMIENTO OPERATIVO OK
```

El certificador crea errores sintéticos aislados, prueba el saneamiento Outbox, la reaplicación Inbox, el bloqueo de tipos no soportados, verifica convergencia/idempotencia y elimina los Inbox sintéticos al terminar.
