# Sprint 50B — Fix NativeCommandError en PowerShell 5.1

Corrección puntual del restaurador para Windows PowerShell 5.1.

El comando `dropdb --if-exists` puede escribir un `NOTICE` en stderr aun terminando con código 0. Con `$ErrorActionPreference = Stop`, PowerShell 5.1 convierte ese stderr en `NativeCommandError`.

Se corrigen **todas las llamadas `dropdb --if-exists` del restaurador**, no solo el cleanup final:

- limpieza previa de la base temporal de certificación;
- limpieza final de la base temporal;
- `dropdb` del flujo de restauración de producción.

La ejecución ignora únicamente stderr informativo del proceso nativo y sigue validando estrictamente `$LASTEXITCODE`. `createdb`, `pg_restore`, integridad SHA256, conteo de tablas y migraciones mantienen sus comprobaciones.
