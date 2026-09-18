# Sprint 50B - Fix marcador de restauracion PowerShell 5.1 (v8)

La restauracion ya estaba siendo correcta: 85 tablas y 60 migraciones restauradas en una base temporal, sin modificar produccion.

El falso negativo ocurria porque `restaurar-edge.ps1` imprimia `SIGR RESTORE VERIFICADO OK` con `Write-Host`. En Windows PowerShell 5.1 `Write-Host` usa el stream de informacion y no queda capturado por `2>&1`, por lo que `certificar-backup-edge.ps1` mostraba el mensaje en consola pero no podia encontrarlo en `$restoreOutput`.

Correccion:

- `restaurar-edge.ps1` emite tambien un marcador por el success stream: `RESTORE_CERTIFIED|tables=...|migrations=...|production=false`;
- el certificador valida ese marcador estructurado y exige que los conteos coincidan exactamente con `metadata.json`;
- se reemplaza `exit 0` por `return` para no depender del comportamiento del host PowerShell.

No se modifica la base productiva ni el formato de los backups.
