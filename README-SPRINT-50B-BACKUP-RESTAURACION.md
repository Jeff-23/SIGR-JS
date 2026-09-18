# Sprint 50B — Backup local automático y restauración certificada

## Objetivo

Proteger el primer restaurante local-first sin depender de Cloud. El nodo EDGE debe poder generar copias recuperables de PostgreSQL y archivos operativos, conservarlas fuera del repositorio, rotarlas automáticamente y demostrar que un backup puede restaurarse sin tocar la base productiva durante la certificación.

## Archivos

- `scripts/backup-edge.ps1`: genera un ZIP con `database.dump`, `backend/storage/media`, `backend/storage/soportes`, metadatos sanitizados y manifiesto SHA256.
- `scripts/configurar-backup-edge.ps1`: crea la tarea diaria `SIGR Backup Local Diario`.
- `scripts/restaurar-edge.ps1`: verifica restauración en una base temporal o, con confirmación explícita, permite restaurar producción.
- `scripts/certificar-backup-edge.ps1`: certifica backup real, integridad, restauración aislada, salud del nodo, programación diaria y exclusión de secretos.

## Ubicación por defecto

Los backups se guardan en:

`%LOCALAPPDATA%\SIGR\backups`

No se guardan dentro del repositorio Git.

## Seguridad

El paquete NO incluye `deploy/node/.env`, `JWT_SECRET`, `POSTGRES_PASSWORD`, `SYNC_PEER_KEY` ni otras credenciales. Para recuperar un equipo completo se instala primero un EDGE limpio con secretos nuevos y luego se restaura el backup de datos.

La restauración de producción está protegida. Requiere expresamente:

`-Modo Produccion -Confirmacion RESTAURAR-SIGR`

Antes de modificar producción el script crea un backup de emergencia.

## Retención

Por defecto se conservan los 14 backups más recientes. El backup automático se programa a las 23:30 y requiere que la sesión de Windows esté iniciada y Docker Desktop disponible.

## Certificación

Ejecutar:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\certificar-backup-edge.ps1
```

Resultado esperado:

`SIGR SPRINT 50B BACKUP Y RESTAURACION OK`

La certificación nunca reemplaza la base productiva: crea una base PostgreSQL temporal, restaura el dump, compara el número de tablas y migraciones y elimina la base temporal al terminar.

## Alcance futuro

50B protege contra corrupción lógica, errores de actualización y pérdida del repositorio local mientras el disco siga disponible. Una copia automática a USB/NAS/otro equipo o almacenamiento externo se tratará en un bloque posterior para cubrir pérdida física del PC o del disco.
