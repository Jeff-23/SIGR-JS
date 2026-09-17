# Sprint 49A — Diagnóstico híbrido operativo

## Objetivo

Exponer al administrador el estado real de sincronización EDGE / CLOUD sin utilizar rutas internas de certificación en la interfaz.

## Incluye

- pantalla de continuidad con diagnóstico real del nodo;
- separación visual entre Outbox EDGE y cola offline del navegador;
- acceso a `/continuidad` restringido a `AUDITORIA_VER`;
- visualización de conectividad del peer, pendientes, errores, conflictos y marcas de último sync;
- certificador reproducible `scripts/certificar-sync-49a.ps1`.

## Requisitos previos

El backend 49A debe incluir `GET /sync/estado` y haber compilado correctamente.

## Certificación

Ejecutar la topología híbrida de smoke y después:

`powershell -ExecutionPolicy Bypass -File .\scripts\certificar-sync-49a.ps1`

Resultado esperado:

`SIGR SYNC 49A DIAGNOSTICO OPERATIVO OK`


## Ajustes de certificación v2

- La certificación no depende de la contraseña histórica de `admin@sigr.com`.
- `GET /sync/estado` sigue protegido por JWT + `AUDITORIA_VER`.
- El certificador comprueba que `/sync/estado` responda 401 sin JWT y usa un endpoint interno protegido por `SyncCertGuard` únicamente para la medición automatizada.
- El endpoint interno de certificación no expone payloads, hashes ni claves.
