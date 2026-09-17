# FIX cierre integral Sprint 48D v2

Corrige el uso de `$host` en PowerShell.

PowerShell trata `$Host` como una variable automática de solo lectura y los nombres de variables no distinguen mayúsculas/minúsculas. El certificador usaba `$host` como variable y parámetro, por lo que fallaba antes de comenzar la prueba multidominio.

Corrección:
- renombra `$host` a `$nodeBase` en todo el certificador;
- no cambia backend, Prisma, Docker ni datos;
- no requiere rebuild ni migración.

Ejecutar directamente:
`powershell -ExecutionPolicy Bypass -File .\scripts\certificar-sync-48d-cierre.ps1`
