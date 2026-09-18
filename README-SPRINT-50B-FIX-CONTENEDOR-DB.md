# Sprint 50B - Fix de deteccion de PostgreSQL

El backup y la restauracion ya no dependen exclusivamente de `docker compose ps -q db`.

La deteccion intenta primero el proyecto Compose normal y, si ese comando no devuelve un contenedor util, localiza de forma segura el servicio `db` por etiquetas Docker y por el puerto PostgreSQL local configurado. Si hay cero o varios candidatos, aborta en lugar de elegir uno arbitrariamente.

Tambien se corrige la copia de `backend/storage/media` y `backend/storage/soportes` para que el comodin se expanda realmente.

No se modifica la base, no se rotan credenciales y no se incluye `deploy/node/.env` en los backups.
