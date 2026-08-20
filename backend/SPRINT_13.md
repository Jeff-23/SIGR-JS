# Sprint 13 — Deuda técnica y contrato API

Fecha de cierre: 20 de agosto de 2026. Alcance: backend exclusivamente.

## Objetivo de negocio

Reducir el riesgo de integración y operación antes de iniciar la integración fiscal real. El sprint convierte OpenAPI, métricas, auditoría de dependencias, CI y respaldo en controles verificables sin alterar las reglas comerciales certificadas.

## Entregado

- Contrato OpenAPI enriquecido para 88 operaciones: DTOs derivados de validaciones, etiquetas, resúmenes, respuestas uniformes, Bearer, idempotencia y `X-Request-Id`.
- Validación E2E que rechaza operaciones sin resumen, etiquetas, errores estándar o correlación documentada.
- Métricas Prometheus por método, plantilla de ruta y estado, con histograma de latencia y uptime; no incluyen actor, tenant, parámetros ni identificadores de recursos.
- CI con PostgreSQL real, migraciones, seed doble, lint, build, unitarias, E2E, auditoría y validación de Compose.
- Política de vulnerabilidades que bloquea riesgos altos/críticos nuevos y documenta la única excepción temporal conocida de Prisma.
- Backup sin sobrescritura, checksum SHA-256 y restauración bloqueada ante pérdida de integridad.

## Evidencia ejecutada

- Lint y build aprobados.
- 21 pruebas unitarias y 27 E2E aprobadas.
- 24 migraciones vigentes.
- Contenedores aislados construidos y saludables.
- Seed ejecutado dos veces sin duplicados.
- 88 operaciones OpenAPI; cero operaciones incompletas según la puerta Sprint 13.
- Backup restaurado en base vacía: origen y restauración coincidieron en `24|4|1` (migraciones, planes, usuarios).
- Auditoría: cero vulnerabilidades críticas y tres avisos altos de la cadena Prisma aceptada temporalmente.

## Invariantes preservados

- Aislamiento multiempresa y multisucursal.
- JWT dinámico, planes, capacidades y permisos administrables.
- Pedido ≠ Venta ≠ Pago ≠ Factura ≠ Documento Electrónico.
- Idempotencia comercial y movimientos de inventario compensatorios.
- Sanitización de errores y correlación compartida por respuesta, logs y auditoría.

## Fuera de alcance y continuidad

Los Sprints 14 y 15 se reservan para DIAN. Antes de implementar se deberá confirmar proveedor, ambiente de habilitación, credenciales, certificados, versión UBL, resolución de numeración y procedimientos reales de contingencia.

- Sprint 14 recomendado: modelo fiscal, firma, numeración, UBL, máquina de estados, outbox y adaptador de proveedor en ambiente de habilitación.
- Sprint 15 recomendado: transmisión real, consultas, reintentos, contingencia, notas crédito/débito, reconciliación, observabilidad fiscal y certificación integral.

No se deberá representar un documento como aceptado por DIAN sin una respuesta verificable del proveedor o de la autoridad fiscal.
