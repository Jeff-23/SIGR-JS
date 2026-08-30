# Seguimiento integrado de Sprints 23–32

La certificación consolidada de los Sprints 23–31 está documentada en
`SPRINTS-23-31-SEGUIMIENTO.md`. Este documento registra exclusivamente la
ampliación del Sprint 32 y evita reabrir módulos ya certificados.

## Sprint 32 — Experiencia integral de salón

Objetivo: completar recepción y servicio de mesa sin confundir reserva, pedido,
venta ni pago.

### Criterios funcionales

- Reservas por sede con cliente, contacto, personas, horario, duración, mesa
  opcional, estados y prevención de conflictos.
- Lista de espera ordenada, aviso, asignación de mesa y cancelación.
- Sentar una reserva o espera únicamente en una mesa libre y suficiente.
- Unión de mesas libres a un pedido activo, separación de mesas secundarias y
  traslado transaccional de la mesa principal.
- Cambio de mesero limitado al restaurante y sede del pedido.
- División de cuenta por personas, porcentajes o productos, con conservación
  exacta de centavos.
- Pagos parciales o mixtos asociados a una parte, sin exceder su saldo ni el
  total de la venta.
- Plano de salón con recepción, reservas, espera y acciones del servicio en una
  misma experiencia operativa.

### Estado de cierre — 2026-08-28

Sprint 32 completo en `codex/sprint-32-experiencia-salon`.

Implementado:

- reservas y lista de espera multiempresa/multisucursal;
- asignación segura de mesas y prevención de cruces horarios;
- unión, separación y traslado transaccional de mesas;
- cambio de mesero dentro del alcance autorizado;
- división de cuenta por personas, porcentajes o productos;
- cobros asociados a cada parte sin alterar la separación entre pedido, venta y pago;
- panel integrado de recepción y servicio dentro del salón real.

Certificación final:

- Frontend: lint y build aprobados, 39 pruebas aprobadas y cero vulnerabilidades.
- Backend: lint y build aprobados, 28 unitarias y 50 E2E aprobadas.
- Prisma: 33 migraciones aplicadas y esquema actualizado.
- Docker: imagen `sigr-backend:sprint-32` construida; smoke aprobado con usuario
  no root `sigr` y readiness PostgreSQL 200 sobre base restaurada aislada.
