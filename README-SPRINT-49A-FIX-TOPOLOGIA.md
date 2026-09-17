# Sprint 49A — FIX de certificación de topología

El error HTTP 502 no provenía del endpoint `/sync/estado`.

La certificación 49A requiere la misma topología híbrida certificada en Sprint 48D:

- EDGE: `docker-compose.node.yml`, expuesto en `http://localhost:8080`;
- CLOUD smoke: `docker-compose.cloud.yml` + `docker-compose.cloud-smoke.yml`, expuesto en `http://localhost:8081`;
- variables de `deploy/node/.env`, `deploy/cloud/.env.smoke` y `deploy/sync/.env.smoke`.

Ejecutar `docker compose up -d --build` sin los compose/env anteriores reemplaza el backend EDGE por el compose base, no configura Sync y deja el frontend del nodo como contenedor huérfano. En esa situación Nginx puede responder 502 al intentar alcanzar el backend recreado.

`certificar-sync-49a.ps1` ahora realiza un preflight de `/health/ready` en EDGE y CLOUD. Si la topología no está disponible, invoca automáticamente `scripts/sigr-sync-smoke-up.ps1`, espera ambos nodos y sólo entonces empieza las ocho pruebas de 49A.

No cambia backend, Prisma, frontend ni migraciones.
