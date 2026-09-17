# Sprint 47 · Imágenes de productos

## Bloque A/B implementado

- Una imagen principal opcional por producto.
- Carga autenticada con `PRODUCTOS_EDITAR` y aislamiento por restaurante/sucursal.
- Entrada JPG/PNG/WEBP hasta 12 MB, validación de firma y límite de 40 MP.
- Corrección de orientación EXIF y encuadre 1:1 configurable (foco X/Y + zoom).
- Generación automática WebP: `thumb` 240 px, `medium` 800 px, `large` 1400 px.
- Original pesado no se conserva: se guardan variantes optimizadas y metadatos.
- URL pública opaca/versionada para uso en POS/QR, con caché `immutable` de 1 año.
- Reemplazo atómico a nivel de referencia: primero se generan nuevos archivos y actualiza BD; después se limpia la versión anterior.
- Borrado de foto sin borrar el producto.
- Menú QR consume `medium` con `loading="lazy"` y `decoding="async"`.
- Administración permite elegir/tomar foto, previsualizar, ajustar encuadre y zoom, reemplazar o eliminar.

## Dependencia requerida

Desde `backend/` ejecutar una vez:

```powershell
npm install sharp@0.34.3
npx prisma generate
npx prisma migrate dev
```

En despliegue, `npm ci` instalará Sharp cuando el `package-lock.json` del repositorio local se actualice con el comando anterior.

## Storage y backup

Por defecto: `backend/storage/media`. Se puede cambiar con `MEDIA_STORAGE_DIR`.

Un backup completo de SIGR requiere **PostgreSQL + `MEDIA_STORAGE_DIR`**. La base de datos no almacena binarios de imágenes.

## Siguiente bloque 47C/47D

- Integrar `thumb` en la carta operativa del POS sin interferir con Sprint 46.
- Opción por restaurante/sede para mostrar/ocultar fotos en POS.
- Prueba de 100–300 productos con fotos y red lenta.
- Importación masiva por código de producto + carpeta de imágenes.
- Cola/batch de procesamiento para onboarding masivo.
