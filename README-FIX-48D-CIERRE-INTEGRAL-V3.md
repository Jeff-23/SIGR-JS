# FIX Sprint 48D cierre integral v3

Revisado contra el `sync.controller.ts` y `sync-business-cert.service.ts`
del ZIP actual del proyecto.

Correcciones:
- mantiene `$Host` -> `$nodeBase`;
- `inventory/status` incluye `articuloGlobalId` y `productoGlobalId`;
- usa la estructura actual `{ articulo, producto }`;
- usa `movimientoArticuloGlobalId` y `movimientoProductoGlobalId`;
- elimina referencias al campo inexistente `stockEsperado`;
- valida stock 500 antes de la merma y 425 después;
- añade preflight de contratos GET antes de cortar Cloud;
- todas las rutas de certificación usadas fueron contrastadas con el controller actual.

No cambia backend, Prisma ni Docker.
No requiere rebuild ni migración.
