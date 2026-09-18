# Sprint 50B — Fix backup vacío / base activa

Este ajuste corrige una validación insuficiente detectada durante la certificación de backup y restauración.

## Problema

El flujo anterior podía aceptar como válido un paquete cuyo `metadata.json` reportaba `tableCount=0` y `migrationCount=0`. Como la restauración comparaba contra esos mismos valores, un dump vacío podía producir un falso positivo de "restore verificado".

Además, en instalaciones EDGE heredadas el `.env` del host puede no ser la fuente de verdad de la base que ya está ejecutando el contenedor PostgreSQL.

## Corrección

- El backup toma `POSTGRES_DB` y `POSTGRES_USER` del contenedor PostgreSQL realmente activo.
- Antes de crear el dump exige más de 0 tablas `public` y más de 0 migraciones Prisma.
- Inspecciona el catálogo de `pg_dump` con `pg_restore -l` y rechaza dumps sin tablas.
- La restauración rechaza paquetes con metadatos `0/0` y vuelve a exigir tablas/migraciones > 0 tras restaurar.
- El certificador inspecciona los metadatos antes de iniciar el restore y muestra los conteos reales.
- No se toca la base de producción durante la certificación.

Los backups previos que reporten `0` tablas o `0` migraciones deben considerarse no certificados y no usarse para restauración de producción.
