# Sprint 45 — Centro Operativo Inteligente en Tiempo Real

Base: `23a75f5` (Sprint 44 cerrado).

## Entregado

- Nueva ruta y pantalla `Centro Operativo`.
- Endpoint real `GET /inteligencia/centro-operativo` consolidado por sucursal.
- Permiso específico `CENTRO_OPERATIVO_VER` agregado al catálogo/seed.
- Indicadores en vivo: mesas ocupadas, atención, preparación, retrasados, listos sin retirar, cuentas solicitadas, pendientes de pago y tiempo operativo actual.
- Cola automática con prioridades NORMAL / ATENCION / URGENTE / CRITICO.
- Cálculo de retraso frente a objetivo.
- Resumen agregado por estación Cocina/Bar.
- Detección de pedido parcialmente listo mediante líneas de comandas.
- Resumen operativo por mesa.
- Línea temporal por pedido usando EventoOperacional.
- Acciones directas hacia Cocina/Bar, Salón o Caja.
- Filtros mínimos: prioridad, área, mesero y estado.
- Polling cada 15 segundos; demo enlazado al store operativo existente.
- Reglas agregadas para concentración de comandas y estaciones con múltiples retrasos.
- Umbrales centralizados en backend y opcionalmente configurables mediante `ConfiguracionSucursal` clave `CENTRO_OPERATIVO_UMBRALES`.

## Fuera de alcance respetado

No se agregaron modelos Prisma, inventario, compras, DIAN, nuevos flujos de caja, rediseño de KDS/Salón, IA generativa ni reportes históricos.

## Validación realizada en entorno de preparación

- Backend TypeScript/Nest build: OK.
- ESLint focalizado backend: OK.
- Frontend TypeScript `tsc -b`: OK.
- ESLint focalizado frontend: OK.
- Vitest/build Vite completos no pudieron ejecutarse aquí por el binding opcional Linux de Rollup del node_modules proveniente de Windows; deben validarse en Windows según las instrucciones.
