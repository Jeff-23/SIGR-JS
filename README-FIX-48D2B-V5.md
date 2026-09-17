# Fix 48D-2B v5 — peer Cloud->EDGE

Basado en el SIGR-JS.zip actualizado del usuario.

Corrige la certificacion Cloud->EDGE sin tocar Venta/Pago/Caja productivos:
- durante setup Cloud liga el peer EDGE de certificacion al restaurante/sucursal actuales;
- update-cloud informa cuantos eventos Outbox genero realmente;
- el certificador falla de inmediato si MovimientoCaja no fue encolado;
- diagnostico distingue backlog EDGE vs Cloud.

Requiere reconstruir backend EDGE/CLOUD mediante `sigr-sync-smoke-up.ps1`.
