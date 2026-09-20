# S56E — Quitar logo y fondo correctamente

Corrige la semántica visual de la carta:

- `Quitar fondo` elimina el arte de fondo de la carta actual.
- Al no existir fondo, el sistema YA NO usa automáticamente el logo como marca
  de agua/fondo.
- `Quitar logo` elimina el logo compartido del restaurante mediante el endpoint
  de identidad y afecta todas las cartas, como corresponde a una identidad global.
- Vista previa, PNG/PDF y menú QR dejan de usar los campos legacy de logo como
  fallback silencioso.

No requiere migración ni cambios de backend.
