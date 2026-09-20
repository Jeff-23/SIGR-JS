# S56E — Fix lint identityLogoUrl

El último ajuste dejó una constante `identityLogoUrl` sin uso después de
eliminar el fallback automático del logo como fondo.

Este parche elimina únicamente esa variable sin uso.

No cambia comportamiento, backend, migraciones ni diseño.
