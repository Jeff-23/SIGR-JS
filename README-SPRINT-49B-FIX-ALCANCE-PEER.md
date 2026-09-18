# Sprint 49B - Fix alcance real del peer

El reintento de 49B llegaba correctamente a Cloud, pero Cloud respondia HTTP 400 con `restauranteGlobalId fuera del alcance del peer`.

La causa era el evento sintetico de certificacion: `certification/enqueue` creaba un `SYNC.PING` sin `restauranteGlobalId` ni `sucursalGlobalId`. Desde 48D los peers de certificacion pueden quedar ligados deliberadamente a un restaurante/sucursal para reproducir el aislamiento productivo. Por tanto, el receptor estaba haciendo lo correcto al rechazar un envelope sin ese alcance.

Este fix no relaja ninguna validacion de seguridad ni cambia `SyncPeerGuard`. En su lugar:

- agrega un endpoint exclusivamente de certificacion, protegido por `SyncCertGuard`, para consultar el alcance actual del peer bootstrap en Cloud;
- permite que el `SYNC.PING` sintetico de certificacion lleve opcionalmente `restauranteGlobalId` y `sucursalGlobalId`;
- el certificador 49B lee ese alcance antes de cortar Cloud y crea el evento con el mismo envelope;
- el preflight reconstruye la topologia si los contenedores todavia no contienen este soporte.

No se exponen claves, payloads de negocio ni hashes, no se modifica el alcance del peer y no se crea una excepcion a las reglas multiempresa/multisucursal.
