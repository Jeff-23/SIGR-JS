# S54 — Permiso específico para imprimir comandas

Regla operativa acordada:

- Administrador: puede imprimir/reimprimir comandas.
- Cajero: puede imprimir/reimprimir comandas.
- Mesero: no puede imprimir comandas.
- Cocina: no puede imprimir comandas.
- Bar: no puede imprimir comandas.
- Despacho: no obtiene permiso por estación; depende del rol del usuario.

Cambios:
- Nuevo permiso `COMANDAS_IMPRIMIR`.
- Endpoints de representación y registro de impresión protegidos por ese permiso.
- Botón Imprimir/Reimprimir del KDS sólo aparece con ese permiso.
- Migración concede el permiso únicamente a ADMIN, ADMIN_SEDE y CAJERO.
- No cambia quién puede ver u operar comandas.
