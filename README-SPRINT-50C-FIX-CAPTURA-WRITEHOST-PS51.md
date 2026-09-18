# Sprint 50C - Fix certificador PowerShell 5.1 / Write-Host

## Causa

`estado-actualizacion-edge.ps1` muestra su informacion con `Write-Host`. En Windows PowerShell 5.1 esa salida se ve en consola, pero no forma parte del success stream que el certificador intentaba capturar con `@(& $stateScript 2>&1)`.

Por eso el visor mostraba correctamente `Estado : ROLLED_BACK`, mientras la asercion posterior recibia un texto vacio y generaba un falso negativo.

## Correccion

El certificador sigue ejecutando el visor para observacion humana, pero ya no intenta certificar su texto. Valida directamente la misma fuente de verdad usada por el visor: el JSON mas reciente de `%LOCALAPPDATA%\\SIGR\\updates`.

Se exige que:

- el JSON mas reciente sea exactamente el generado por el rollback de la prueba;
- `status` sea `ROLLED_BACK`;
- `rollback` sea `CODE_IMAGES`;
- backend y frontend permanezcan saludables.

No cambia actualizacion, rollback, migraciones, base de datos ni backups.
