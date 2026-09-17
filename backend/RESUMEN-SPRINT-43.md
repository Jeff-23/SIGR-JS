# Sprint 43 — Caja/POS profesional

## Resultado funcional

- Nueva experiencia POS para la venta seleccionada con **Total / Pagado / Pendiente** visibles permanentemente.
- Selección rápida de ventas pendientes por venta, pedido, mesa o cliente.
- Medios de pago como bloques visuales: efectivo, tarjeta, transferencia, QR/otro.
- Pagos parciales y mixtos como movimientos independientes.
- Efectivo recibido y cálculo de cambio sin inflar el importe aplicado a la venta.
- Cliente, descuento autorizado y propina editables **antes del primer pago**.
- Protección de descuentos automáticos existentes.
- División de cuenta conservando el backend ya implementado.
- Devoluciones de pagos conservando el pago original.
- Factura interna desde Caja sin mezclarla con el pago.
- Impresión/reimpresión de factura mediante permiso de lectura de facturas.
- Preparación de documento electrónico separada y explícitamente marcada como "sin envío fiscal automático".
- Recuperación/idempotencia de cobros inciertos conservada.
- Demo de Caja renovado para representar el flujo profesional con pagos parciales y mixtos.

## Backend agregado

`PATCH /ventas/:id/liquidacion`

Permite actualizar, antes de cobrar:
- descuento total;
- propina;
- cliente.

Restricciones:
- venta no anulada;
- sin pagos;
- sin factura;
- sin división de cuenta;
- descuento total >= descuentos automáticos aplicados;
- descuento manual requiere `DESCUENTOS_APLICAR`;
- cliente debe pertenecer al restaurante correspondiente.

## Puerta técnica ejecutada en el entorno de análisis

- Backend `npm run build`: OK.
- Backend ESLint sin autofix (`npx eslint ...`): OK.
- Frontend ESLint: OK.
- Frontend TypeScript (`npx tsc -b`): OK.
- Frontend build completo: bloqueado en este entorno Linux por dependencia nativa opcional de Rolldown faltante en el `node_modules` incluido dentro del ZIP, después de que TypeScript terminó correctamente.
- Frontend Vitest: bloqueado por la misma clase de dependencia nativa opcional de Rollup faltante en el `node_modules` del ZIP.

Ejecuta `npm run test:unit` y `npm run build` en tu instalación Windows normal después de copiar los archivos.
