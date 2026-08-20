# Continuidad operativa Frontend V2

## Nivel 1 — PWA por dispositivo (Sprint 18)

- Cachea únicamente la aplicación estática.
- Conserva borradores y operaciones pendientes en IndexedDB.
- Cada mutación usa una clave de idempotencia.
- Al reconectar, sincroniza en orden y se detiene ante el primer conflicto.
- Nunca cachea respuestas autenticadas del backend en el service worker.

## Nivel 2 — Nodo local por sucursal (siguiente etapa)

Necesario para que meseros, cocina, bar y caja sigan compartiendo estados cuando la conexión a internet se interrumpe. El nodo debe ser autoridad temporal de la sucursal y replicar con el backend central al recuperar conectividad.

## Nivel 3 — Continuidad eléctrica

Requiere UPS para router/nodo, dispositivos con batería, política de impresión y procedimiento manual. El frontend debe mostrar claramente qué nivel de continuidad está disponible; nunca debe prometer sincronización entre equipos cuando sólo existe almacenamiento local.
