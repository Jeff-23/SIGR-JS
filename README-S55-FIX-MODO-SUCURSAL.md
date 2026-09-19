# S55 — Fix retorno de sucursal

El método `sucursalEnAlcance()` ya validaba correctamente el alcance,
pero no devolvía la sucursal. `modoSucursal()` necesita `restauranteId`
para resolver `QR_MODO`.

Este parche añade únicamente `return sucursal;`.

No cambia reglas de negocio, permisos, migraciones ni frontend.
