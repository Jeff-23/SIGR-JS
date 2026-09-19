# Sprint 52 - Ajuste unir mesas V3

Correcciones acotadas:

- Rediseña la unión de mesas antes del pedido como selector compacto, evitando listar todas las mesas en una columna enorme.
- Las mesas seleccionadas quedan visibles como chips removibles.
- Mantiene la unión como acción opcional antes de crear el pedido.
- Garantiza en datos existentes que los roles base `MESERO` tengan `PEDIDOS_CREAR` y `PEDIDOS_EDITAR`, sin conceder `MESAS_EDITAR`.
- Después de aplicar la migración, el mesero debe cerrar sesión e iniciar sesión de nuevo para refrescar el JWT/permisos.

No cambia cancelación, caja, impresión ni preparación.
