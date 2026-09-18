# Sprint 49B — Diagnóstico profundo y recuperación controlada

Este bloque amplía el diagnóstico operativo certificado en 49A sin alterar la semántica de negocio ni permitir reparación directa de base de datos.

## Alcance

- `GET /sync/diagnostico/outbox` con `AUDITORIA_VER` lista hasta 200 eventos Outbox en `ERROR` dentro del restaurante/sucursal del usuario.
- `GET /sync/diagnostico/inbox` con `AUDITORIA_VER` lista hasta 200 recepciones Inbox en `ERROR`.
- Los listados no exponen `payload`, `payloadHash` ni claves de sincronización.
- Outbox se clasifica como `REINTENTABLE`, `EN_ESPERA`, `HISTORICO_DESTINO` o `SIN_SYNC`.
- Inbox se clasifica como `NO_SOPORTADO` o `REQUIERE_REVISION` y permanece de solo lectura.
- `POST /sync/diagnostico/outbox/:eventId/reintentar` requiere `SYNC_CONFLICTOS_GESTIONAR`, `confirmar=true` y actúa sobre un solo evento.
- Un evento cuyo destino ya no está activo no se reencola automáticamente.
- Los conflictos abiertos continúan usando `/sync/conflictos`; 49B no cambia su semántica ni fuerza overwrite de negocio.
- La pantalla de Continuidad separa Outbox, Inbox, conflictos y cola local del navegador.

## Fuera de alcance

No se editan payloads, no se borran errores, no se fuerza reaplicación de Inbox, no se hacen cambios directos en PostgreSQL y no se añade reintento masivo.

## Certificación

Ejecutar desde la raíz:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\certificar-sync-49b.ps1
```

El certificador restaura la topología Sync Smoke si hace falta, valida protección JWT, crea un error Outbox controlado con Cloud temporalmente fuera de línea, comprueba clasificación y detalle seguro, ejecuta un reintento unitario, recupera Cloud y verifica convergencia e idempotencia.

Resultado esperado:

```text
SIGR SYNC 49B RECUPERACION CONTROLADA OK
```
