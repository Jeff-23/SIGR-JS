# Sprint 14 — Núcleo fiscal DIAN multiempresa

Fecha: 20 de agosto de 2026. Alcance: backend y ambiente de habilitación preparado; sin transmisión externa ficticia.

## Decisión operativa

Las comandas de papel son soportes internos de pedidos. Su digitación posterior genera una `Venta` con origen `MANUAL_CIERRE`, pero no crea Factura ni Documento Electrónico. La decisión fiscal permanece explícita:

`Comanda interna → Venta manual → [opcional] Factura → [opcional] Documento Electrónico → numeración → firma/transmisión futura`.

## Entregado

- Perfil fiscal aislado por restaurante y referencias a secretos externos; no se almacenan certificados, PIN ni tokens en claro.
- Modos proveedor tecnológico y software propio, con ambiente de habilitación o producción.
- Resoluciones y rangos por restaurante, opcionalmente limitados a una sucursal.
- Asignación serializable de consecutivos, control de vigencia y agotamiento, y unicidad por resolución.
- Estados `PREPARADO`, `NUMERADO` y `EN_COLA` antes de los estados de transmisión existentes.
- Borrador UBL 2.1/DIAN 1.9 determinista, escapado y con hash SHA-256. No contiene firma XAdES ni se presenta como documento aceptado.
- Historial fiscal append-only y outbox persistente preparado para el Sprint 15.
- Pruebas multiempresa que verifican secretos por referencia, aislamiento y que una venta manual no factura automáticamente.

## Restricciones deliberadas

- El XML generado es un borrador de intercambio para el adaptador; el proveedor seleccionado deberá validar, completar y firmar según su contrato y el anexo técnico vigente.
- CUFE, QR, referencia y aceptación sólo se registrarán desde una respuesta verificable.
- La selección del proveedor tecnológico, sus credenciales sandbox y el onboarding de cada restaurante son requisitos para cerrar transmisión real en el Sprint 15.

## Fuentes oficiales

- Anexo Técnico de Factura Electrónica de Venta versión 1.9, publicado en el micrositio DIAN.
- Resolución DIAN 000227 de 2025 y compilación aplicable.
- Instructivo DIAN de registro, modo de operación, habilitación y numeración.
