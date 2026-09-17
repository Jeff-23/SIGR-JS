# Fix 48D-2D cycle route

Corrige el certificador para usar el endpoint real existente:
`POST /sync/internal/certification/cycle`

en lugar de la ruta inexistente:
`POST /sync/internal/cycle`.

Conserva además la lectura de `SYNC_CERT_KEY` desde `deploy/sync/.env.smoke` y el header `x-sigr-cert-key`.
No requiere rebuild ni migraciones porque solo cambia el script PowerShell de certificación.
