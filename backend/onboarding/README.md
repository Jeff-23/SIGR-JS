# Onboarding de catálogo e imágenes · Sprint 47D

El importador está diseñado para la carga inicial de un restaurante. No expone un endpoint público y **no modifica nada por defecto**.

## 1. Preparar CSV

Usa `catalogo-ejemplo.csv`. Excel puede abrirlo y volver a guardarlo como CSV UTF-8 con `;`.

Columnas:

- `codigo`: obligatorio, único dentro de la sucursal. Se normaliza a MAYÚSCULAS.
- `nombre`: obligatorio.
- `descripcion`: opcional.
- `categoria`: obligatoria; si no existe, se crea al aplicar.
- `precio`: obligatorio, número >= 0.
- `estacion`: opcional; debe coincidir con nombre o código de una estación existente (`COCINA`, `BAR`, etc.).
- `favorito`, `disponible`, `activo`: `si/no`, `true/false`, `1/0`.
- `imagen`: opcional; sólo nombre de archivo, sin carpetas.

Pon las fotos en una sola carpeta. El nombre indicado en `imagen` debe coincidir exactamente.

## 2. Simular primero (obligatorio)

Desde `backend`:

```powershell
npm run catalog:import -- --csv onboarding\cliente\catalogo.csv --images onboarding\cliente\imagenes --restaurante-id 1 --sucursal-id 2 --report onboarding\cliente\reporte-dry-run.json
```

Sin `--apply` no crea ni modifica productos. Valida CSV, duplicados, sucursal, estaciones e imágenes.

## 3. Aplicar

Sólo cuando el reporte no tenga errores:

```powershell
npm run catalog:import -- --csv onboarding\cliente\catalogo.csv --images onboarding\cliente\imagenes --restaurante-id 1 --sucursal-id 2 --report onboarding\cliente\reporte-aplicado.json --apply --strict-images
```

El proceso es idempotente por `codigo`: si se ejecuta de nuevo, actualiza el producto de esa sucursal en vez de duplicarlo. Las imágenes se procesan **una por una** para evitar picos de RAM/CPU. Si una imagen no cambió, se reutiliza.

## 4. Certificar media

```powershell
npm run media:certify
```

Comprueba que cada registro activo tenga `thumb`, `medium` y `large`, y reporta pesos p50/p95/máximo. Falla si falta una variante o se superan los umbrales de seguridad.

## 5. Backup completo

Una copia completa de SIGR requiere PostgreSQL + media:

```powershell
.\scripts\backup-completo.ps1 -OutputDir ..\backups\cliente-2026-09-14
```

Restauración (destructiva sobre la BD destino, requiere confirmación explícita):

```powershell
.\scripts\restore-completo.ps1 -InputDir ..\backups\cliente-2026-09-14 -ConfirmRestore
```

La restauración conserva la carpeta de media anterior con sufijo `.pre-restore-*` para recuperación manual.
