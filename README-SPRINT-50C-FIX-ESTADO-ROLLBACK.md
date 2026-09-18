# Sprint 50C - Fix estado de rollback

Correccion puntual del visor y del registro operacional de actualizaciones EDGE.

## Problema

Durante la certificacion de rollback, el archivo de estado `ROLLED_BACK` no incluia `migrationsAfter`. Con `Set-StrictMode -Version Latest`, `estado-actualizacion-edge.ps1` intentaba leer una propiedad inexistente y abortaba, aunque el rollback de imagenes ya habia terminado correctamente y el nodo estaba saludable.

## Correccion

- `actualizar-edge.ps1` registra `tablesAfter` y `migrationsAfter` tambien en estados `ROLLED_BACK` cuando el conteo esta disponible; si el conteo posterior falla, conserva los valores previos para el rollback de codigo sin cambios de esquema.
- `RECOVERY_REQUIRED` registra los conteos posteriores cuando pueden obtenerse.
- `estado-actualizacion-edge.ps1` trata propiedades historicas opcionales de forma compatible con los JSON ya creados y no falla bajo PowerShell 5.1 + StrictMode.

No cambia la politica de rollback, no revierte migraciones y no toca la base de datos productiva.
