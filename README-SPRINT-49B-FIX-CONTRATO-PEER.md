# Sprint 49B - Fix contrato peer-scope v5

Corrige un error exclusivo del certificador 49B v4.

El endpoint interno `GET /sync/internal/certification/peer-scope` devuelve el registro `SyncPeer` con la propiedad `nodeId`. El script v4 intentaba leer `peerNodeId`, por lo que obtenia una cadena vacia y abortaba con `Cloud reporta un peer de certificacion inesperado` aun cuando el peer habia sido encontrado correctamente.

Este ajuste:

- lee `nodeId`, que es el contrato real devuelto por el backend;
- conserva `peerNodeId` como fallback por compatibilidad;
- exige que exista un identificador de peer;
- solo compara contra `EDGE_NODE_ID` si esa variable existe en `deploy/sync/.env.smoke`;
- no modifica seguridad, SyncPeer, alcance multiempresa, transporte ni datos de negocio.

No requiere reconstruir backend porque el endpoint ya devuelve correctamente `nodeId`. Solo debe reemplazarse el certificador y volver a ejecutarlo.
