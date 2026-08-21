+# Sprint 22 — Salón y toma de pedidos real

Fecha de cierre: 20 de agosto de 2026  
Rama de trabajo: `codex/sprint-22-salon-pedidos`

## Objetivo de negocio

Sustituir el salón demostrativo por un flujo operativo conectado al backend, apto para restaurantes multisede y resistente a reintentos de red, sin confundir Pedido, Venta, Pago, Factura ni Documento Electrónico.

## Alcance entregado

- Consulta real y filtrada por sucursal de zonas, mesas, productos y pedidos.
- Mapa de mesas con estados libre, ocupada y pendiente de pago.
- Ocupación sin pedido y liberación sin consumo.
- Pedidos de mesa, mostrador, para llevar y domicilio.
- Carta por categoría, búsqueda, cantidades y observaciones por línea.
- Creación idempotente de pedidos mediante `Idempotency-Key`.
- Cola offline sólo para creación idempotente; no se encolan operaciones cuya repetición podría duplicar efectos.
- Envío a preparación, detección y reenvío de cantidades pendientes.
- Ampliación de pedidos existentes.
- Cuenta preliminar con detalle y total.
- Cancelación condicionada por permisos y reglas del backend.
- Seguimiento de pedidos activos con actualización periódica.
- Modo demostración conservado y aislado de sesiones reales.

## Decisiones de diseño

1. La sucursal seleccionada forma parte de todas las consultas operativas, pero el backend vuelve a validar el alcance del JWT.
2. Las observaciones pertenecen a `DetallePedido`; productos iguales con observaciones distintas no se fusionan.
3. Sólo la creación del pedido se conserva offline porque ahora dispone de idempotencia persistente. Comandas, ampliaciones y transiciones exigen confirmación del servidor.
4. Crear un pedido y crear una comanda siguen siendo operaciones separadas. La interfaz las encadena y permite recuperar envíos pendientes sin alterar la separación de dominios.
5. La cuenta mostrada es preliminar: no crea Venta, Pago, Factura ni Documento Electrónico.

## Evidencia de aceptación

- Backend lint, build y unitarias: verdes.
- Backend E2E: 10 suites, 43 pruebas verdes.
- Frontend lint y build: verdes.
- Frontend unitarias: 4 archivos, 12 pruebas verdes.
- Migración `20260820220000_sprint22_salon_pedidos` aplicada correctamente.
- Certificación completa y publicación: registradas en el cierre Git del sprint.

## Fuera de alcance

- KDS avanzado por estaciones y alertas audiovisuales: Sprint 23.
- Cobro y cierre comercial completo: Sprint 24.
- Emisión fiscal DIAN real: mantiene su flujo y etapa de habilitación independientes.

