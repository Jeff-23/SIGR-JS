# Sprint 50C — Actualización segura del nodo EDGE local

## Objetivo

Dar al primer restaurante un procedimiento repetible para desplegar una nueva versión del código ya preparado en el repositorio local, sin depender de Cloud y sin improvisar operaciones sobre Docker o PostgreSQL.

50C **no descarga ni mezcla código automáticamente**. La entrega de una nueva versión al checkout local sigue siendo una acción explícita del técnico. El actualizador se encarga del paso peligroso: respaldo, reconstrucción, migraciones, health checks, registro y rollback controlado.

## Flujo de actualización

`scripts/actualizar-edge.ps1`:

1. exige Docker y EDGE saludables;
2. rechaza cambios sin commit en `backend`, `frontend`, `docker-compose.node.yml` y `deploy/node`;
3. genera un backup 50B antes de tocar el stack;
4. conserva las imágenes actuales para rollback;
5. registra commit, rama, conteo de tablas y migraciones fuera del repositorio;
6. ejecuta `docker compose ... up -d --build` sobre el nodo local;
7. exige `migrate ExitCode=0`, backend ready y frontend healthy;
8. compara el conteo de migraciones antes/después.

## Regla de rollback

El rollback automático solo se hace cuando **el conteo de migraciones no cambió**. En ese caso se restauran las imágenes backend/frontend/migrate anteriores y se recrea el stack.

Si una actualización falla después de aplicar nuevas migraciones, 50C **no intenta deshacer el esquema automáticamente**. El estado queda como `RECOVERY_REQUIRED` y el operador recibe la ruta del backup 50B que debe usarse para una recuperación controlada.

Esta restricción evita asumir que una migración Prisma es reversible cuando no necesariamente lo es.

## Historial

Los estados se guardan en:

`%LOCALAPPDATA%\SIGR\updates`

No se guardan JWT, contraseñas PostgreSQL ni `SYNC_PEER_KEY`.

Para revisar el último estado:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\estado-actualizacion-edge.ps1
```

## Certificación

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\certificar-actualizacion-edge.ps1
```

La certificación hace un despliegue real del commit actual con backup previo y luego simula un fallo post-deploy sin cambio de esquema para probar el rollback automático de código.

Cierre esperado:

`SIGR SPRINT 50C ACTUALIZACION LOCAL OK`

## Fuera de alcance

- `git pull`, merges o cambios de rama automáticos;
- descarga remota de releases;
- rollback automático de migraciones;
- restauración automática de producción;
- Cloud obligatorio.
