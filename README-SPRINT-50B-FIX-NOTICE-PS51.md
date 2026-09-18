# Sprint 50B - Fix NOTICE PostgreSQL en Windows PowerShell 5.1

## Problema

Durante la restauracion de verificacion, `dropdb --if-exists` puede escribir un mensaje `NOTICE` por stderr cuando la base temporal aun no existe. En Windows PowerShell 5.1, con `$ErrorActionPreference = 'Stop'`, ese stderr puede convertirse en `NativeCommandError` aunque `dropdb` termine correctamente con codigo 0.

## Correccion

`restaurar-edge.ps1` incorpora una ejecucion silenciosa y acotada para tareas de cleanup. Solo durante esas llamadas se usa `ErrorActionPreference = Continue`, stderr se descarta y luego se restaura la politica original.

No se cambia la logica de restauracion, no se modifica produccion y no se ignoran errores de `createdb`, `pg_restore` ni consultas de integridad.
