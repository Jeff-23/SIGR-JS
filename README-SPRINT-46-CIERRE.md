# SIGR — Sprint 46 · cierre de carta escalable

## Cambios incluidos
- Navegación horizontal de categorías con pista visual en móvil.
- Categorías con snap horizontal para mejorar el gesto táctil.
- Tarjetas de producto con altura más estable para nombres largos.
- Tooltip nativo con nombre/categoría/estación completos.
- Observaciones del pedido mantienen el texto completo accesible por title.
- Filtrado/paginación del catálogo extraídos a utilidades testeables.
- Prueba de estrés lógica para catálogo de 300 productos.

## Archivos
- frontend/src/pages/RealSalonPage.tsx
- frontend/src/features/salon/catalog.ts
- frontend/src/features/salon/catalog.spec.ts

## Validación realizada
- ESLint focalizado: OK.
- TypeScript `tsc -b`: OK.
- Smoke test Node sobre 300 productos: OK.
  - categoría: 30/300 correctamente aislados
  - búsqueda por estación Bar: 75 resultados
  - favoritos: 15 resultados
  - paginación progresiva 60 / 120 / 300
- Vitest no pudo ejecutarse en este entorno porque el ZIP contiene node_modules de Windows y falta el binario opcional Linux de Rollup (`@rollup/rollup-linux-x64-gnu`). El archivo de prueba queda incluido para ejecutarlo normalmente en Windows.

## Pruebas de cierre en el equipo real
1. PC: abrir una mesa, agregar 10–15 productos de varias categorías y verificar que el pedido permanezca visible.
2. Móvil: deslizar categorías, buscar un producto y comprobar la barra fija `Pedido en curso`.
3. Tablet: navegar categorías y agregar productos sin que el resumen desaparezca.
4. Si hay catálogo real grande, validar búsqueda por nombre/categoría/estación y `Mostrar 60 más`.
5. Confirmar que un producto agotado sigue visible pero no se puede agregar.
6. Confirmar que en un pedido existente el botón diga `Enviar sólo líneas nuevas` y no reenvíe líneas previas.

No modifica backend, inventario, KDS, caja, pagos ni flujo comercial.
