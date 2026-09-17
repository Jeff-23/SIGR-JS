# SIGR · Sprint 47D · Cierre de imágenes y onboarding masivo

Este bloque completa la preparación para el primer cliente sin convertir la carga masiva en una operación manual producto por producto.

## Incluye

- `codigo` / SKU opcional en Producto, visible en administración y buscable desde Salón.
- Migración `20260914210000_sprint47d_codigo_producto`.
- Importador CLI seguro de catálogo + carpeta de imágenes.
- Modo `DRY_RUN` por defecto; sólo modifica datos con `--apply`.
- Importación idempotente por código dentro de la sucursal.
- Validación de duplicados, sucursal, estación, precios e imágenes antes de aplicar.
- Creación controlada de categorías inexistentes.
- Procesamiento de imágenes secuencial para evitar picos de CPU/RAM.
- Reutilización de imagen cuando el hash no cambió.
- Reporte JSON de cada onboarding.
- Certificación de media: variantes faltantes, pesos y percentiles.
- Backup completo PostgreSQL + media con SHA-256.
- Restore completo con confirmación explícita y conservación de la media anterior.

## Instalación

Desde `backend`:

```powershell
npx prisma migrate dev
npx prisma generate
npm run build
```

Después en `frontend`:

```powershell
npm run build
```

No ejecutar `migrate reset`.

## Flujo obligatorio para el primer cliente

1. Copiar `backend/onboarding/catalogo-ejemplo.csv` y llenarlo.
2. Poner las fotos en una carpeta única.
3. Ejecutar DRY RUN y revisar el JSON.
4. Corregir cualquier error.
5. Crear backup completo antes de importar.
6. Ejecutar con `--apply --strict-images`.
7. Ejecutar `npm run media:certify`.
8. Revisar catálogo, POS y QR en PC/tablet/móvil.

Comandos detallados en `backend/onboarding/README.md`.

## Criterio de seguridad

La importación masiva no está expuesta como endpoint público. Es una herramienta de onboarding operada por el administrador técnico. Eso evita que una carga de 200 fotos compita con el tráfico normal del POS.

## Validaciones realizadas en el parche

- `node --check scripts/importar-catalogo.mjs`: OK.
- `node --check scripts/certificar-media.mjs`: OK.
- `npm run catalog:import -- --help`: OK.
- Prisma generate no pudo ejecutarse en este contenedor porque intenta descargar el engine Linux sin acceso de red. Debe ejecutarse en el equipo Windows después de copiar la migración.
- El `tsc` completo del ZIP base disponible aquí presenta un error previo en `LoyaltyPage.tsx` relacionado con `FormData.entries`; no proviene de este bloque.
