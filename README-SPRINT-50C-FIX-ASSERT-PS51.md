# Sprint 50C - Fix assertion PowerShell 5.1

El despliegue saludable y el rollback de codigo ya estaban funcionando. El fallo de certificacion ocurria al pasar el resultado de `-match` sobre un array directamente a un parametro `[bool]` bajo Windows PowerShell 5.1.

La correccion une la salida del visor en un unico texto y valida de forma explicita `Estado : ROLLED_BACK`.

No cambia despliegue, backup, migraciones, rollback ni contenedores.
