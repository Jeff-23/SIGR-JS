# Sprint 48C — SIGR Cloud productivo

## Objetivo
Preparar la contraparte Cloud del futuro sistema híbrido sin implementar todavía la sincronización Local ↔ Cloud.

## Topología
- Caddy es el único servicio publicado a Internet (80/443).
- Frontend React compilado se sirve desde Nginx interno.
- `/api/*` se enruta al backend NestJS interno.
- PostgreSQL NO publica puertos.
- Backend NO publica el puerto 3000.
- Media y soportes usan volúmenes persistentes propios del Cloud.
- `prisma migrate deploy` se ejecuta antes del backend.
- Caddy gestiona HTTPS automáticamente cuando el DNS del dominio apunta al VPS.

## Prueba local sin VPS
La prueba smoke usa un proyecto Docker separado y una base vacía independiente. No toca `sigr-js` Local Node ni su base.

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\configurar-cloud-smoke.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\sigr-cloud-smoke-up.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\certificar-cloud-smoke.ps1
```

Resultado esperado:
`SIGR CLOUD SMOKE OK`

La prueba local usa HTTP sólo para validar la topología. No certifica HTTPS público.

## Despliegue posterior en VPS
1. Crear `deploy/cloud/.env` a partir de `.env.example`.
2. Crear registro DNS del dominio hacia la IP pública del VPS.
3. Abrir únicamente TCP 80, TCP 443 y UDP 443 en el firewall público (más SSH restringido para administración).
4. Ejecutar:

```bash
docker compose --env-file deploy/cloud/.env -f docker-compose.cloud.yml up -d --build
```

5. Certificar desde un equipo externo:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\certificar-cloud-produccion.ps1 -Url https://DOMINIO
```

## Print Agent
`SIGR_PRINT_ALLOWED_ORIGINS` permite agregar el dominio Cloud de forma explícita sin abrir el agente a cualquier sitio. El agente continúa ligado a loopback.

## Fuera de 48C
- Sincronización Local ↔ Cloud.
- Resolución de conflictos.
- Operación offline distribuida.
- Replicación de PostgreSQL entre nodos.

Esos puntos comienzan en 48D.
