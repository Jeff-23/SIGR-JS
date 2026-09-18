# Sprint 50A — instalación EDGE local-first

El primer restaurante opera de forma local y autónoma. Cloud no es requisito para una sola sede.

## Configuración existente

Si `deploy/node/.env` ya existe, el instalador **no regenera** `POSTGRES_PASSWORD` ni `JWT_SECRET`. Hace una copia de seguridad y adapta solamente la configuración operativa necesaria para local-first:

- `SYNC_ENABLED=false`
- `SYNC_ROLE=EDGE`
- `SYNC_NODE_ID=<nodo elegido>`
- peer Cloud y claves de certificación vacíos

Esto permite reutilizar de forma segura la base PostgreSQL y datos que ya existen en el volumen Docker.

No se debe usar una reinstalación que genere una contraseña PostgreSQL nueva sobre un volumen existente: PostgreSQL conserva la credencial con la que fue inicializado y el backend dejaría de poder conectarse.

## Instalación

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\instalar-edge.ps1 -NodeId edge-restaurante-001
```

## Certificación

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\certificar-instalacion-edge.ps1
```

Cierre esperado:

```text
SIGR SPRINT 50A INSTALACION EDGE OK
```

## Diagnóstico

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\sigr-node-doctor.ps1
```

El diagnóstico no imprime contraseñas, JWT ni claves de peer.
