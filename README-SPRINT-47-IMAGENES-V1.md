# SIGR · Sprint 47 · Imágenes de productos · Bloque 47A + base 47B/47C

Este parche inicia el Sprint 47 con la infraestructura que debe existir antes de cargar fotos del primer cliente. No cierra todavía el sprint completo: la importación masiva/cola de onboarding queda para 47D.

## Qué queda implementado

### Backend seguro y aislado
- `ImagenProducto` como metadata separada de `Producto`; PostgreSQL no almacena binarios.
- Una imagen principal opcional por producto.
- Aislamiento por restaurante/sucursal al subir, reemplazar o eliminar.
- Almacenamiento configurable con `MEDIA_STORAGE_DIR` (por defecto `backend/storage/media`).
- Estructura física por `restaurante/producto/token-version`.
- URL pública opaca y versionada para poder usar la misma media en POS y menú QR sin una consulta de BD por cada `<img>`.
- Caché pública `immutable` por un año. Cambiar la foto genera un token nuevo, por lo que no hay que purgar caché.

### Fotos pesadas de celulares/cámaras
- Entrada admitida: JPG/JPEG, PNG y WEBP.
- Máximo de entrada: 12 MB.
- Validación de firma real del archivo; no se confía sólo en extensión/MIME.
- Hasta 60 MP para cubrir cámaras móviles de alta resolución manteniendo un límite de seguridad.
- Corrección automática de orientación EXIF.
- Procesamiento serializado por instancia del backend para impedir picos de CPU/RAM por varias fotos pesadas simultáneas.
- Las tres variantes se generan secuencialmente para reducir presión de memoria.
- El original pesado no se conserva indefinidamente.

### Optimización automática
Se genera WebP 1:1:
- `thumb`: 240×240, POS.
- `medium`: 800×800, menú QR.
- `large`: 1400×1400, administración/futuro.

El restaurante no tiene que conocer resolución, WebP ni compresión.

### Administración intuitiva
En **Catálogo y clientes → Productos → Foto**:
- Elegir/tomar foto.
- Vista previa cuadrada.
- Ajuste horizontal/vertical del foco.
- Zoom 1×–2.5×.
- Guardar/reemplazar.
- Eliminar la foto sin eliminar el producto.

### POS y QR
- POS utiliza `thumb`, `loading="lazy"`, dimensiones reservadas y carga sólo en productos renderizados por el Sprint 46.
- Botón `Fotos sí/no` por dispositivo para equipos/redes donde se prefiera máxima densidad/velocidad.
- Menú QR utiliza `medium` con lazy loading.
- Si un producto no tiene foto, el flujo sigue funcionando normalmente.

## Aplicación en tu repositorio

Después de copiar el parche, desde `backend`:

```powershell
npm install sharp@0.34.3
npx prisma migrate dev
npx prisma generate
npm run build
```

No uses `migrate reset`.

El `npm install` actualizará tu `package-lock.json` local. Este ZIP no reemplaza el lock porque el entorno donde se preparó el parche no pudo acceder al registry para resolver los binarios Linux/Windows de Sharp/Prisma.

Luego en `frontend`:

```powershell
npm run build
```

## Variables

Opcional en backend `.env`:

```env
MEDIA_STORAGE_DIR=storage/media
```

## Backup

A partir de este sprint un backup completo será:

1. PostgreSQL.
2. `MEDIA_STORAGE_DIR`.

Respaldar sólo PostgreSQL ya no incluye las fotografías.

## Pruebas para cerrar 47A/47B

1. Producto sin foto sigue visible y vendible.
2. Subir JPG de teléfono de varios MB.
3. Subir PNG y WEBP.
4. Intentar archivo inválido renombrado `.jpg`: debe rechazarse.
5. Ajustar foco y zoom antes de guardar.
6. Reemplazar foto y verificar que aparece la nueva sin borrar caché manualmente.
7. Eliminar foto y comprobar fallback.
8. POS PC/tablet/móvil: carta sigue fluida y se puede desactivar `Fotos`.
9. Menú QR: imagen visible, carga diferida y pedido funciona aunque una foto no cargue.
10. Probar tenant/sucursal distinta: no debe poder modificar la foto de un producto fuera de alcance.

## Pendiente para 47D antes del onboarding masivo

- Código/SKU/PLU estable de producto para emparejar Excel + fotos.
- Importador masivo de imágenes.
- Cola persistente para procesar lotes de 100–300 fotos sin bloquear el API.
- Certificación con 100–300 productos fotografiados y red lenta.
- Procedimiento de backup/restauración conjunto BD + media.
