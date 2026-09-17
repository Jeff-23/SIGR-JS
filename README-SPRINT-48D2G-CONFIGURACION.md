# SIGR Sprint 48D-2G — Configuración híbrida

## Alcance

- Configuración de sucursal EDGE ↔ CLOUD.
- Configuración de restaurante CLOUD → EDGE.
- Jerarquía efectiva: predeterminado < restaurante < sucursal.
- Identidad visual de restaurante replicada a los EDGE.
- Idempotencia mediante upsert por `(restauranteId, clave)` y `(sucursalId, clave)`.
- Validación estricta de tenant/sucursal al aplicar eventos.

## Regla de autoridad

En modo híbrido, la configuración de **restaurante** es autoritativa en CLOUD para evitar que dos EDGE cambien simultáneamente parámetros globales durante una partición de red. La configuración específica de **sucursal** sí puede modificarse offline en EDGE y converge con CLOUD.

## No incluido

- Perfil fiscal DIAN.
- Resoluciones/numeración DIAN.
- Certificados o secretos de proveedor tecnológico.
- Credenciales de impresoras o secretos locales del host.

Estos datos se mantienen fuera del snapshot de configuración operativa.

## Migración

No requiere migración Prisma.

## Certificación

Después de aplicar el ZIP en la raíz:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\sigr-sync-smoke-up.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\certificar-sync-48d2g.ps1
```

Resultado esperado:

```text
SIGR SYNC 48D-2G OK
```
