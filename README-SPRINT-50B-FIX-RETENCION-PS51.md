# Sprint 50B — Fix retención Windows PowerShell 5.1

Corrige la retención de backups cuando existe un solo archivo ZIP.

Con `Set-StrictMode -Version Latest`, Windows PowerShell 5.1 puede devolver un único resultado de `Get-ChildItem` como objeto escalar; en ese caso `.Count` no existe. El script ahora fuerza el resultado a `@(...)` antes de evaluar la retención.

No cambia el formato del backup, no elimina backups adicionales fuera de la política configurada, no toca producción y no altera credenciales.
