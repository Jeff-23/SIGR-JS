# Seguimiento integrado de Sprints 23–33

Los cierres de los Sprints 23–32 permanecen documentados en
`SPRINTS-23-31-32-SEGUIMIENTO.md`. Este documento incorpora exclusivamente el
Sprint 33, sin reabrir módulos certificados.

## Sprint 33 — Promociones y fidelización

Objetivo: habilitar reglas comerciales y una relación consolidada con el
cliente, manteniendo el aislamiento multiempresa/multisucursal y la separación
entre pedido, venta, pago, factura y documento electrónico.

### Criterios funcionales

- Promociones porcentuales o de valor fijo, con vigencia, horario, días de la
  semana, compra mínima, sede, productos, combinabilidad y estado.
- Cupones normalizados por restaurante, con vigencia, límite de usos y
  asignación opcional a un cliente.
- Aplicación transaccional y trazable del mejor descuento válido al crear la
  venta, sin convertir promociones en documentos fiscales.
- Fidelización con saldo, puntos históricos, niveles, multiplicadores,
  acumulación al completar el pago, redención y reversos append-only.
- Historial consolidado del cliente con compras, pagos, descuentos,
  movimientos de puntos e indicadores.
- Consentimiento independiente para correo, SMS y WhatsApp, con fuente,
  responsable y fecha de revocación.
- Panel frontend para administrar promociones, cupones y niveles, consultar el
  cliente y registrar sus consentimientos.
- Captura de cupón y redención de puntos en ventas directas y comandas de papel.

### Estado de cierre — 2026-08-29

Sprint 33 completo en `codex/sprint-33-promociones-fidelizacion`.

Certificación final consolidada:

- Frontend: lint y build aprobados, 39 pruebas aprobadas y cero vulnerabilidades.
- Backend: lint y build aprobados, 28 unitarias y 51 E2E aprobadas; auditoría
  sin vulnerabilidades altas o críticas.
- Prisma: 34 migraciones aplicadas y esquema actualizado.
- Docker: construcción desde base vacía, migración, health/readiness y usuario
  no root aprobados; carga de 100 solicitudes sin errores, p95 de 53,65 ms.
