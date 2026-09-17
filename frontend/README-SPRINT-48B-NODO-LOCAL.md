# Sprint 48B — SIGR Local Node productivo (desarrollo)

Este bloque empaqueta el SIGR actual como un nodo local reproducible sin cambiar la lógica funcional ni la base de datos del Sprint 48A.

## Qué contiene

- PostgreSQL 15 persistente.
- `prisma migrate deploy` antes del backend.
- Backend NestJS productivo y health check.
- Frontend React compilado, servido por Nginx.
- Proxy mismo origen `/api/*` hacia NestJS. No se publica el backend directamente a la LAN.
- `backend/storage/media` y `backend/storage/soportes` persistentes en el host.
- Reinicio automático de contenedores con `unless-stopped`.
- Scripts PowerShell para configurar, iniciar, detener, consultar y certificar el nodo.

## No incluye todavía

- SIGR Cloud.
- Sincronización Edge ↔ Cloud.
- Resolución de conflictos distribuida.
- HTTPS LAN/PWA instalable desde una IP local.
- Instalación real en el PC del restaurante.

Esas piezas corresponden a bloques posteriores. 48B valida primero que el restaurante pueda tener un SIGR local autónomo dentro de su red.

## Primera prueba en desarrollo

Desde la raíz del repositorio:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\configurar-node-local.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\sigr-node-up.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\certificar-node-local.ps1
```

Resultado esperado:

```text
SIGR LOCAL NODE OK
```

El frontend queda en `http://localhost:8080` y desde otro equipo de la misma red puede abrirse como `http://IP-DEL-PC:8080`.

## Datos existentes

El compose conserva el mismo nombre de proyecto `sigr-js`, servicio `db` y volumen lógico `sigr_js_pgdata` para reutilizar la base local ya existente cuando se ejecuta desde este repositorio. No utiliza `down -v` ni elimina volúmenes.

## Backup

Las imágenes continúan físicamente en `backend/storage/media`, por lo que el `backup:full` ya certificado sigue encontrándolas. PostgreSQL sigue en Docker y es compatible con el mecanismo de dump existente.

## Seguridad en este bloque

El puerto PostgreSQL se publica sólo en `127.0.0.1`. El backend sólo está dentro de la red Docker. La LAN ve únicamente Nginx por el puerto del nodo. `.env` del nodo está ignorado dentro de `deploy/node` y no debe versionarse.
