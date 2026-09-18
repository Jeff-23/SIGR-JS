# Sprint 49B — Fix de preflight de imagen

El certificador ahora distingue entre una topologia saludable y una topologia que todavia ejecuta la imagen del sprint anterior.

Antes de comenzar 49B verifica que `GET /api/sync/diagnostico/outbox` exista. Una respuesta 401/403 confirma que la ruta esta montada y protegida. Si recibe 404, ejecuta `scripts/sigr-sync-smoke-up.ps1` para reconstruir EDGE/CLOUD con el codigo actual, espera readiness y vuelve a verificar la ruta.

No cambia logica de negocio, Prisma ni endpoints. Solo corrige el preflight del certificador.
