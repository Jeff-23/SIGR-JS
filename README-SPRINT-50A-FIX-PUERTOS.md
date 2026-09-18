# Sprint 50A - Fix de validacion de puertos

El backend de SIGR se ejecuta en el puerto 3000 dentro de la red Docker, pero ese puerto no debe publicarse al host. La salida de `docker compose ps` puede mostrar `3000/tcp` aunque sea solamente un puerto interno/expuesto.

El certificador anterior usaba `docker compose port backend 3000`, que en algunas versiones de Docker Compose puede producir una salida no vacia aun cuando no exista una vinculacion real al host. Esto provocaba un falso negativo en la certificacion.

La validacion ahora consulta `docker inspect` y revisa `NetworkSettings.Ports`:

- PostgreSQL `5432/tcp` debe tener bindings exclusivamente en `127.0.0.1`.
- Backend `3000/tcp` debe tener binding nulo o vacio.
- El frontend sigue siendo el unico acceso HTTP publicado para usuarios, en el puerto configurado por `NODE_HTTP_PORT`.

Este cambio no modifica contenedores, configuracion, datos, secretos ni reglas de red; solo corrige la forma de certificar la topologia ya existente.
