# FIX Sprint 48D-2H v3 — serialización BigInt

Causa confirmada por log:
`TypeError: Do not know how to serialize a BigInt`

`resolverCertificacion()` devolvía el registro Prisma completo de `SyncConflicto`.
Ese modelo contiene `id` BigInt y Express/Nest no puede serializarlo con JSON.stringify.

Corrección:
- Se añade `select` al update de certificación.
- Solo se devuelven campos JSON-seguros:
  conflictoId, eventId, estado, resolucion y resueltoEn.
- No se cambia la lógica de conflicto, idempotencia ni persistencia.
- No requiere migración.

Como cambia backend, reconstruir el stack híbrido antes de repetir la certificación.
