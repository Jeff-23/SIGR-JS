# Sprint 48D-2H — Auditoría, trazabilidad y conflictos híbridos

Este bloque añade una cola persistente de conflictos de sincronización sin alterar la semántica at-least-once ni el hash autoritativo del Inbox.

Incluye:
- detección y registro idempotente de reutilización de `eventId` con payload diferente;
- registro persistente de errores al aplicar eventos;
- trazabilidad de nodo origen/destino, restaurante/sucursal, agregado, tipo de evento y hashes;
- estado `ABIERTO`, `RESUELTO` o `DESCARTADO`;
- resolución automática de errores de aplicación cuando el mismo evento luego se aplica correctamente;
- revisión administrativa `GET /sync/conflictos` con `AUDITORIA_VER`;
- resolución administrativa `POST /sync/conflictos/:conflictoId/resolver` con `SYNC_CONFLICTOS_GESTIONAR`;
- sin almacenar el payload completo dentro de la cola de conflictos, para evitar duplicar datos sensibles.

La resolución administrativa no fuerza un overwrite de negocio: documenta que el conflicto fue revisado/resuelto o descartado. Los reintentos normales siguen pasando por Inbox y las reglas de negocio existentes.
