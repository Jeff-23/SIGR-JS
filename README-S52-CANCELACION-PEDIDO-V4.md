# S52 V4 - Cancelación operativa de pedido

- Otorga `PEDIDOS_CANCELAR` a los roles base MESERO, igual que CAJERO.
- La acción se muestra en Salón para usuarios autorizados.
- Antes de iniciar preparación: permite cancelar el pedido por error.
- Cuando alguna comanda/línea ya está EN_PREPARACION/LISTA/ENTREGADA: la acción permanece visible pero deshabilitada con el texto `Cancelación bloqueada`.
- El backend sigue siendo la autoridad final y conserva todas sus validaciones.

Después de aplicar la migración, cerrar sesión e iniciar de nuevo para renovar el JWT.
