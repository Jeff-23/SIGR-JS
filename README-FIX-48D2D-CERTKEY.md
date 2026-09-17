# Fix 48D-2D certificación

Corrige únicamente el script de certificación 48D-2D.

Problema: el script usaba una clave hardcodeada y el header `x-sigr-sync-cert`, pero el backend actual usa `x-sigr-cert-key` y toma la clave desde `deploy/sync/.env.smoke`.

No requiere rebuild, migración ni reinicio de Docker.
