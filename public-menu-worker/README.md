# SIGR · Menú QR público

Capa pública mínima para el modo `SOLO_MENU`. Guarda un snapshot de la carta en Cloudflare Workers KV. El PC EDGE sólo realiza conexiones salientes para publicar; el backend local y PostgreSQL no se exponen a Internet.

## Preparación inicial

1. Instalar dependencias: `npm install`.
2. Autenticar Wrangler: `npx wrangler login`.
3. Crear KV: `npx wrangler kv namespace create MENU_SNAPSHOTS`.
4. Copiar `wrangler.toml.example` como `wrangler.toml` y poner el `id` del KV.
5. Crear un secreto aleatorio y configurarlo: `npx wrangler secret put PUBLISH_TOKEN`.
6. Desplegar: `npm run deploy`.
7. Copiar la URL `https://...workers.dev` en `PUBLIC_MENU_BASE_URL` del EDGE y usar el mismo secreto como `PUBLIC_MENU_PUBLISH_TOKEN`.

No guardar el secreto real en Git.

## Desactivar una publicación

SIGR retira el snapshot público antes de marcar la publicación como inactiva localmente. El Worker expone `DELETE /admin/publish/:branchId`, protegido con el mismo `PUBLISH_TOKEN`. Si Cloudflare no confirma la eliminación, EDGE conserva el estado activo para no mostrar una falsa desactivación.
