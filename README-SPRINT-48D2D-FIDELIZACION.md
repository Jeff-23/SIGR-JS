# Sprint 48D-2D — Clientes y fidelización híbrida

Incluye CLIENTE, NIVEL_FIDELIZACION, CUENTA_FIDELIZACION, MOVIMIENTO_PUNTOS y CONSENTIMIENTO_CLIENTE.

- Añade globalId estable a entidades de fidelización que aún no lo tenían.
- Sync EDGE↔CLOUD por outbox/inbox existente.
- MovimientoPuntos se aplica por snapshot idempotente y lleva la cuenta al saldoPosterior; no vuelve a sumar puntos al reintentar.
- Consentimiento usa cliente+canal como clave natural y evita duplicados.
- No toca facturación electrónica/DIAN.

Certificación: `powershell -ExecutionPolicy Bypass -File .\scripts\certificar-sync-48d2d.ps1`
