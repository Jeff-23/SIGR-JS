# Sprint 50F — Certificación integral del nodo EDGE listo para producción

## Objetivo

Cerrar el bloque local-first del primer restaurante con una certificación única que ejecute y consolide las garantías obtenidas en 50A–50E.

## Alcance

`certificar-nodo-produccion-edge.ps1` ejecuta, en este orden:

1. 50A — instalación EDGE local.
2. 50B — backup real y restore aislado.
3. 50C — actualización segura y rollback de código.
4. 50D — endurecimiento de seguridad local.
5. 50E — continuidad y recuperación.
6. Validaciones finales directas de Docker, HTTP, aislamiento de puertos, backup reciente, seguridad y continuidad.
7. Registro de un estado `PRODUCTION_READY_LOCAL` bajo `%LOCALAPPDATA%\SIGR\production-readiness`.

## Principios

- No habilita Cloud ni sincronización.
- No realiza `git pull`, merge, push o cambio de rama.
- No almacena secretos en el historial 50F.
- El restore usado por 50B/50E es aislado y no reemplaza producción.
- 50C puede reconstruir contenedores y simular un fallo post-deploy para certificar rollback.
- 50E puede detener temporalmente frontend/backend para certificar recuperación.

Por lo anterior, ejecutar 50F en una ventana de mantenimiento y no durante servicio activo del restaurante.

## Ejecutar

```powershell
cd C:\Users\User\Desktop\SIGR-JS
powershell -ExecutionPolicy Bypass -File .\scripts\certificar-nodo-produccion-edge.ps1
```

Cierre esperado:

```text
SIGR SPRINT 50F NODO EDGE LISTO PARA PRODUCCION OK
```

Consultar el último estado:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\estado-produccion-edge.ps1
```

## Criterio de aceptación

El nodo se considera listo para producción local cuando 50A–50E terminan con código 0 y los invariantes finales permanecen válidos: `EDGE`, Sync desactivado, servicios Docker saludables, HTTP 200, PostgreSQL solo loopback, backend sin puerto directo, backup reciente, seguridad `HARDENED` y continuidad `HEALTHY`.
