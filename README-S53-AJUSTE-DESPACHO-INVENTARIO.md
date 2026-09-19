# S53 — Ajuste operativo: Despacho + inventario

Este parche complementa el Sprint 53 ya certificado.

## Qué resuelve

1. Crea la estación `DESPACHO` para las sucursales existentes.
   - La identidad `globalId` se deriva del `globalId` de la sucursal para que EDGE y CLOUD converjan.
   - No elimina ni desactiva `BAR` automáticamente, porque podría tener productos/comandas históricas.
   - Las sucursales nuevas también nacen con `DESPACHO`.

2. Corrige la creación de productos:
   - `Disponible para venta` inicia marcado.
   - `Requiere preparación` inicia marcado.
   - El usuario desmarca `Requiere preparación` sólo para entrega directa.

3. Aclara Inventario:
   - `Ajustar` sólo aparece para productos `STOCK_DIRECTO` y para insumos.
   - `NO_CONTROLAR` muestra `No aplica · sin control de stock`.
   - `POR_RECETA` muestra `No aplica · por receta`.

## Configuración sugerida para una bebida de nevera

- Estación: `Despacho`
- Control de inventario: `STOCK_DIRECTO`
- Unidad: `UNIDAD`
- Disponible para venta: Sí
- Requiere preparación: No

La bebida continúa en la comanda, pero se opera como entrega directa.
