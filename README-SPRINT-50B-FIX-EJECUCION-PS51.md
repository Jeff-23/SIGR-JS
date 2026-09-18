# Sprint 50B - Fix integral de ejecucion PowerShell 5.1

El diagnostico directo del contenedor confirmo que `sigr_db` contiene 85 tablas y que el backend usa esa misma base. Los conteos 0/0 anteriores eran falsos negativos provocados por la cadena Windows PowerShell 5.1 -> `docker exec` -> `sh -lc` y el quoting de SQL/variables.

Este fix elimina `sh -lc` de las operaciones PostgreSQL criticas de 50B:

- `psql`, `pg_dump`, `pg_restore`, `createdb` y `dropdb` se invocan directamente mediante `docker exec`;
- `POSTGRES_USER` y `POSTGRES_DB` se obtienen de `docker inspect`, sin imprimir secretos;
- stderr de procesos nativos se captura de forma compatible con Windows PowerShell 5.1 y se decide por el exit code real;
- los backups con 0 tablas o 0 migraciones se siguen rechazando;
- la restauracion de verificacion exige coincidencia exacta de tablas y migraciones;
- la restauracion de produccion sigue protegida por `-Confirmacion RESTAURAR-SIGR` y crea un backup de emergencia previo.

No se modifica la base productiva durante `certificar-backup-edge.ps1`.
