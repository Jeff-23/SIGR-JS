# SIGR — Backup automatizado (Windows + Docker)

Este parche convierte la prueba manual del Sprint 47D en comandos simples. No modifica lógica de negocio ni la base de datos.

## Uso diario
Desde `C:\Users\User\Desktop\SIGR-JS\backend`:

```powershell
npm run backup:full
```

El comando detecta automáticamente el contenedor PostgreSQL en ejecución, crea un `database.dump`, comprime `backend/storage/media`, calcula SHA-256, genera `manifest.json` y verifica el backup antes de considerarlo válido.

Los backups quedan por defecto en:

`C:\Users\User\Desktop\SIGR-JS\backups\sigr-backup-AAAAMMDD-HHMMSS`

No sobrescribe backups anteriores.

## Verificar un backup existente

```powershell
npm run backup:verify -- -BackupDir ..\backups\sigr-backup-AAAAMMDD-HHMMSS
```

Comprueba hashes, catálogo de PostgreSQL y cantidad de archivos de media sin tocar la base real.

## Probar que un backup restaura

```powershell
npm run restore:verify -- -BackupDir ..\backups\sigr-backup-AAAAMMDD-HHMMSS
```

Crea una base TEMPORAL con nombre `sigr_restore_verify_*`, restaura el dump, cuenta tablas, extrae la media en una carpeta temporal y luego elimina todo lo temporal. No toca `sigr_db` ni `backend/storage/media`.

## Backup diario automático
No lo actives todavía en desarrollo. Cuando empiece el piloto real:

```powershell
npm run backup:schedule:install
```

Por defecto agenda una tarea diaria a las 02:00 y conserva 30 días de backups verificados. Sólo elimina carpetas antiguas cuyo nombre empiece por `sigr-backup-`. Para otra hora:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-backup-task.ps1 -At 03:30
```

Para retirar la tarea:

```powershell
npm run backup:schedule:remove
```

## Requisitos
- Docker Desktop en ejecución.
- Un único contenedor PostgreSQL de SIGR en ejecución, por ejemplo `sigr-js-db-1`.
- `backend/storage/media` contiene las imágenes optimizadas.

Si hubiera más de un PostgreSQL en ejecución, los scripts se detienen en lugar de adivinar. Se puede indicar el contenedor explícitamente con `-DbContainer` al llamar el `.ps1`.

## Seguridad
- No usa ni imprime la contraseña de PostgreSQL.
- No necesita cambiar la ExecutionPolicy global: npm invoca PowerShell con `-ExecutionPolicy Bypass` sólo para ese proceso.
- `restore:verify` nunca restaura sobre la base activa.
- Los backups no se sobrescriben.
- La tarea diaria aplica retención de 30 días por defecto; el backup manual no elimina nada.
- SHA-256 detecta corrupción/modificación, pero NO cifra el backup. El cifrado del almacenamiento se configurará al preparar producción/piloto.
