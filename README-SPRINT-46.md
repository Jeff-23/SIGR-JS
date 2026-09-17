# SIGR — Sprint 46 · Carta escalable y toma de pedido

Parche generado sobre el ZIP actualizado recibido el 14/09/2026.

## Alcance implementado
- Catálogo y pedido separados en dos zonas en PC/tablet.
- Catálogo con scroll propio para que una carta grande no empuje el pedido fuera de vista.
- Pedido/líneas nuevas fijo en escritorio durante la navegación de la carta.
- Búsqueda diferida por nombre, descripción, categoría y estación.
- Categorías y favoritos siempre accesibles en la cabecera del catálogo.
- Render progresivo: 60 productos inicialmente y carga de 60 adicionales bajo demanda.
- Estado vacío cuando no hay coincidencias y acceso directo a toda la carta cuando Favoritos está vacío.
- Productos agotados visibles pero bloqueados para agregar.
- Distinción reforzada entre pedido existente y “líneas nuevas” para no reenviar consumos anteriores.
- Barra móvil fija con cantidad, total y acceso a “Ver pedido”.
- Contrato frontend actualizado con campos visuales de mesa ya usados por el salón y descripción del producto.

## No incluido
- Imágenes de productos (Sprint 47).
- Importación Excel/CSV.
- Cambios de backend o modelo Prisma.
- Búsqueda por código: el modelo Producto actual no dispone de un código comercial propio.

## Validación realizada
- ESLint focalizado: OK.
- TypeScript `tsc -b`: OK.
- Vitest no pudo ejecutarse en este entorno porque el ZIP contiene node_modules de Windows y falta el binario opcional Linux de Rollup (`@rollup/rollup-linux-x64-gnu`).

## Aplicación
Copiar conservando rutas desde la raíz del repositorio y reiniciar el frontend.
