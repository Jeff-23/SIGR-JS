# Seguimiento integrado de Sprints 23–34

Los cierres de los Sprints 23–33 permanecen documentados en
`SPRINTS-23-33-SEGUIMIENTO.md`. Este documento incorpora exclusivamente el
Sprint 34.

## Sprint 34 — Menú QR y pedidos propios

### Criterios implementados

- Acceso público revocable y no predecible por mesa.
- Menú público aislado por restaurante y sede, únicamente con categorías y
  productos activos.
- Carrito móvil con cantidades, total calculado en servidor, observaciones y
  protección contra doble envío mediante clave de cliente.
- Seguimiento público de estados pendiente, aceptado o rechazado.
- Bandeja operativa en tiempo real para aceptar o rechazar solicitudes.
- Generación de QR imprimible y enlace por mesa.
- Configuración heredable `QR_REQUIERE_ACEPTACION`, activa por defecto.
- Una solicitud pendiente no crea pedido ni comanda. Al aceptarla se crea un
  `Pedido` independiente; el envío a cocina continúa siendo una operación
  posterior del flujo existente.
- En aceptación automática se crea el pedido, pero tampoco se crea ni envía
  una comanda automáticamente.
- Aislamiento multiempresa y multisucursal en generación, consulta y resolución.

### Evidencia local — 2026-08-29

- Backend: lint, build y 28 pruebas unitarias aprobados.
- Frontend: lint, 40 pruebas unitarias y build aprobados.
- Prisma: esquema formateado, cliente generado y migración SQL versionada.
- La migración y los E2E dependientes de PostgreSQL quedaron condicionados al
  motor Docker local, que no respondió aunque Docker Desktop fue iniciado.
