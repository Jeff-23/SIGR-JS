# Fix 48D-2B v6 — trazabilidad exacta Cloud->EDGE

Este parche parte del estado acumulado actual y del fix v5. No toca Prisma ni datos.

Corrige un defecto de observabilidad del transporte: el ciclo EDGE devolvia pull=0 tanto si Cloud no entregaba eventos como si los entregaba pero EDGE los rechazaba. Ahora informa `fetched`, `sourceMismatch` y `applyErrors`.

Tambien hace que la operacion de certificacion Cloud devuelva los eventId/origen/destino/estado Outbox exactos del MovimientoCaja y el certificador valida que el destino sea `EDGE_NODE_ID` y el origen `CLOUD_NODE_ID` antes de continuar.

El script de arranque deja de forzar `--no-cache`; Docker reconstruye las capas cuyo codigo cambio y reutiliza dependencias, reduciendo tiempo sin esconder cambios.
