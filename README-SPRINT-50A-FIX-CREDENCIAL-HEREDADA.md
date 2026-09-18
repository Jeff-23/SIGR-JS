# Sprint 50A - Fix v4: credencial PostgreSQL heredada

La instalacion local puede partir de un `deploy/node/.env` creado durante las certificaciones 48D/49. El instalador preserva deliberadamente `POSTGRES_PASSWORD` y `JWT_SECRET` para no romper el volumen PostgreSQL existente.

El certificador anterior exigia una longitud minima de 24 caracteres a `POSTGRES_PASSWORD`, requisito correcto para una instalacion nueva pero incompatible con una credencial heredada que ya esta funcionando.

Este fix separa **certificacion operativa** de **endurecimiento de credenciales**:

- `POSTGRES_PASSWORD` debe existir y la base debe responder correctamente.
- PostgreSQL debe seguir publicado exclusivamente en `127.0.0.1`.
- Si la clave heredada tiene menos de 24 caracteres, 50A muestra una advertencia pero no intenta rotarla automaticamente.
- Las instalaciones nuevas siguen generando una clave fuerte.
- La rotacion de una clave heredada se hara despues de forma transaccional y segura, actualizando PostgreSQL y el `.env` sin recrear ni perder el volumen.

No se imprime ninguna credencial.
