# Sprint 50E — Continuidad operativa y recuperación del nodo EDGE

## Objetivo

Cerrar la preparación operativa del primer restaurante local-first ante reinicios de Windows, demora de Docker Desktop, caída de contenedores y necesidad de comprobar un backup antes de una recuperación real.

Este sprint no introduce dependencia de Cloud y no modifica el modelo de datos.

## Archivos

- `scripts/iniciar-edge.ps1`: espera Docker Engine, intenta iniciar Docker Desktop en modo Startup, levanta el stack y exige `node-health` + `health/ready` antes de declarar el nodo saludable.
- `scripts/configurar-arranque-edge.ps1`: instala `SIGR-EDGE-Autostart.cmd` en la carpeta Startup del usuario actual. No requiere modificar Git ni guardar secretos.
- `scripts/diagnosticar-caida-edge.ps1`: clasifica Docker, DB, backend, frontend, endpoints y último backup; escribe un diagnóstico sanitizado en `%LOCALAPPDATA%\SIGR\continuity`.
- `scripts/recuperar-edge.ps1`: ofrece reinicio seguro, verificación del último backup y restauración productiva solo con confirmación explícita.
- `scripts/certificar-continuidad-edge.ps1`: simula una caída de frontend/backend, ejecuta recuperación, valida diagnóstico, restaura el último backup en una base temporal y verifica que producción siga sana.

## Arranque después de un corte eléctrico

La instalación actual usa Docker Desktop, por lo que la recuperación automática ocurre **después de que el usuario de Windows inicie sesión**. El lanzador de Startup llama `iniciar-edge.ps1 -Startup`; si Docker Engine aún no responde, intenta abrir Docker Desktop y espera hasta que esté disponible antes de levantar SIGR.

Para operación verdaderamente desatendida antes del login de Windows haría falta cambiar la estrategia de runtime (por ejemplo, un servicio/host de contenedores apropiado). 50E no finge esa garantía.

## Recuperación segura

Reinicio del nodo:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\recuperar-edge.ps1 -Modo Reiniciar
```

Verificar el último backup sin tocar producción:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\recuperar-edge.ps1 -Modo VerificarBackup
```

Restaurar producción es una acción destructiva controlada y exige confirmación explícita:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\recuperar-edge.ps1 -Modo RestaurarProduccion -Confirmacion RESTAURAR-SIGR
```

Antes de restaurar producción, Sprint 50B crea un backup de emergencia y su restaurador conserva sus propias validaciones de integridad.

## Estado y secretos

Los estados se guardan en:

`%LOCALAPPDATA%\SIGR\continuity`

No se guardan `POSTGRES_PASSWORD`, `JWT_SECRET`, `SYNC_PEER_KEY` ni otras credenciales.

## Certificación

Ejecutar:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\certificar-continuidad-edge.ps1
```

Resultado esperado:

`SIGR SPRINT 50E CONTINUIDAD Y RECUPERACION OK`

La certificación detiene temporalmente frontend/backend para probar la recuperación, pero no reemplaza la base productiva. La prueba de backup usa la restauración aislada de Sprint 50B.
