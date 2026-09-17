# Fix Sprint 48C smoke

Corrige dos fallos exclusivos de la certificación local:

1. El backend se iniciaba con `NODE_ENV=production`, pero el smoke usa deliberadamente `http://localhost:8081`; la validación de entorno productivo exige CORS HTTPS. El override smoke usa `NODE_ENV=development` sólo para esta prueba local. Las imágenes Docker siguen siendo builds productivos.
2. El certificador trataba la salida multilínea de `docker compose ps` como un escalar; en PowerShell `-notmatch` sobre arrays produce una colección y podía reportar falsamente que faltaba `db`. Ahora normaliza la salida a texto antes de comprobar servicios.

No cambia `docker-compose.cloud.yml` ni la configuración de producción real.
