# Sprint 50D — Endurecimiento operativo y seguridad local

Objetivo: dejar el nodo EDGE local listo para el primer restaurante sin depender de Cloud y sin exponer credenciales ni servicios internos.

## Alcance

- backup 50B obligatorio antes de tocar credenciales;
- rotación automática de `POSTGRES_PASSWORD` solo cuando es débil (<32 caracteres), o forzada con `-RotateAllSecrets`;
- rotación automática de `JWT_SECRET` solo cuando es débil (<48 caracteres), o forzada con `-RotateAllSecrets`;
- secretos nuevos criptográficamente aleatorios y nunca impresos ni guardados en el historial;
- PostgreSQL continúa publicado únicamente en `127.0.0.1`;
- backend continúa sin publicar `3000` al host;
- `METRICS_ENABLED=false` y Swagger debe permanecer deshabilitado por el compose de producción;
- `SYNC_ENABLED=false`, `SYNC_ROLE=EDGE` y claves de peer/certificación vacías para el primer restaurante local-only;
- ACL de `deploy/node/.env` con herencia desactivada y acceso explícito para usuario actual, SYSTEM y Administrators;
- rollback de configuración y credencial PostgreSQL si el endurecimiento falla durante una ejecución controlada;
- historial en `%LOCALAPPDATA%\SIGR\security` sin valores secretos.

## Ejecución

```powershell
cd C:\Users\User\Desktop\SIGR-JS
powershell -ExecutionPolicy Bypass -File .\scripts\certificar-seguridad-edge.ps1
```

Cierre esperado:

```text
SIGR SPRINT 50D SEGURIDAD LOCAL OK
```

## Estado posterior

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\estado-seguridad-edge.ps1
```

## Rotación voluntaria futura

Aunque los secretos ya cumplan longitud, un técnico puede forzar una nueva rotación durante una ventana de mantenimiento:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\endurecer-edge.ps1 -RotateAllSecrets
```

La rotación del JWT invalida sesiones existentes. La operación recrea los contenedores y causa una interrupción breve, por lo que debe ejecutarse fuera del horario de servicio.
