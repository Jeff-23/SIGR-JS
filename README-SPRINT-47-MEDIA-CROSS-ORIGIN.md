# Sprint 47 — corrección de visualización de imágenes

## Causa
Helmet añade por defecto `Cross-Origin-Resource-Policy: same-origin`. SIGR sirve el frontend y el backend desde orígenes distintos (por ejemplo `:5173` y `:3000`), por lo que el navegador bloqueaba las imágenes públicas aunque la subida y el archivo físico fueran correctos.

## Corrección
El endpoint público de media de productos ahora responde explícitamente:

`Cross-Origin-Resource-Policy: cross-origin`

Se mantiene:
- `Content-Type: image/webp`
- `Cache-Control: public, max-age=31536000, immutable`
- `X-Content-Type-Options: nosniff`
- URLs opacas/versionadas por token.

No se cambia la lógica de upload, Prisma, storage, POS, QR ni permisos de edición.

## Prueba
1. Reiniciar backend.
2. Abrir Catálogo y clientes > Producto > Foto.
3. La imagen previamente subida debe mostrarse sin volver a cargarla.
4. Abrir `Ver detalle` en Salón; debe aparecer la versión medium.
5. Probar desde PC y un dispositivo LAN.
