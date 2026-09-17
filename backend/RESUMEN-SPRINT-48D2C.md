# Sprint 48D-2C — Inventario híbrido

Objetivo: sincronizar inventario real EDGE ↔ CLOUD sin duplicar movimientos ni pisar silenciosamente conflictos de stock.

Incluye:
- `ARTICULO.SNAPSHOT_V1`.
- `MOVIMIENTO_INVENTARIO.SNAPSHOT_V1`.
- Referencias distribuidas por `globalId`.
- Hooks reales en Artículos, Inventario, ventas/reversiones y recepción de compras.
- Aplicación idempotente por `globalId` del movimiento.
- Stock de Producto/Artículo llevado al `stockNuevo` del movimiento sólo cuando el destino conserva el `stockAnterior` esperado (o ya está en `stockNuevo`).
- Conflicto explícito `CONFLICT_STOCK` si ambos nodos modificaron el mismo stock de forma incompatible; no se sobrescribe silenciosamente.
- Certificación offline EDGE→CLOUD, reenvío idempotente y CLOUD→EDGE.

No incluye sincronización completa del dominio de abastecimiento/orden/recepción. `RecepcionCompra` aún no tiene identidad distribuida global, por lo que esa relación no se replica en el snapshot del movimiento; el efecto de stock y el movimiento sí se sincronizan. Ese agregado debe abordarse en un bloque posterior.

No requiere migración Prisma.
