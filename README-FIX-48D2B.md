# Fix 48D-2B v2

Parche de reaplicacion controlada del bloque monetario.

- Reaplica los archivos backend de Venta/Pago/Caja/Sync.
- El script `sigr-sync-smoke-up.ps1` comprueba que exista la ruta `certification/money/setup` antes de construir.
- Fuerza reconstruccion sin cache de backend+migrate tanto en EDGE como en CLOUD para evitar ejecutar una imagen anterior.
- No borra bases ni volumenes.
