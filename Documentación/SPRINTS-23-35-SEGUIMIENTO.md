# Seguimiento integrado de Sprints 23–35

Los cierres anteriores permanecen en `SPRINTS-23-34-SEGUIMIENTO.md`.

## Sprint 35 — Proveedores y abastecimiento

- Proveedores aislados por restaurante.
- Insumos suministrados, código del proveedor y precio vigente.
- Solicitudes de compra por sucursal.
- Conversión explícita de solicitud a orden usando la lista de precios.
- Órdenes con total estimado y cantidades pedidas/recibidas.
- Recepciones parciales o totales sin permitir sobre-recepción.
- Diferencia acumulada entre cantidad pedida y recibida por insumo.
- Cada recepción incrementa inventario, actualiza costo y genera un movimiento
  `ENTRADA` trazable; no modifica ventas, pagos, facturas ni documentos DIAN.
- Pantalla operativa y recorrido demostrativo en el frontend.

Validación local: Prisma válido; lint y build backend aprobados; 28 pruebas
backend aprobadas; lint, build y 40 pruebas frontend aprobadas.
