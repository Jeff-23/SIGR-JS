# Sprint 16 — Flujo operativo integral y mitigación

Fecha: 20 de agosto de 2026. Alcance: backend multiempresa para salón, soportes de papel, domicilios, representación impresa e integridad fiscal preventiva.

## Objetivo de negocio

Cerrar brechas entre la operación real de un restaurante y los dominios ya separados de SIGR. El sprint evita liberar mesas por el solo hecho de pagar, preserva la evidencia de ventas digitadas desde papel y modela la entrega a domicilio sin convertir Pedido, Venta, Pago, Factura y Documento Electrónico en una sola entidad.

## Flujo de mesa

- Una mesa puede marcarse ocupada antes de crear un pedido.
- Si las personas se retiran sin ordenar, `liberar-sin-consumo` exige una ocupación manual y ausencia de pedido activo.
- Una ocupación manual puede convertirse en pedido de mesa sin liberar y volver a ocupar la mesa.
- El pago anticipado no libera la mesa mientras cocina/servicio no hayan entregado.
- La entrega libera automáticamente sólo si la Venta ya está pagada; si falta pago, queda `PENDIENTE_PAGO`.
- `finalizar-servicio` es una operación explícita e idempotente que verifica `Pedido ENTREGADO` y `Venta PAGADA`.

## Digitación desde papel

`POST /ventas/manual` exige:

- fecha operativa con zona explícita;
- número de comanda de papel y número de soporte;
- precio unitario original por producto;
- impuestos e impoconsumo originales, incluso cuando son cero;
- `Idempotency-Key`.

El actor autenticado queda como responsable de digitación y `creadoEn` conserva cuándo fue registrada. Las restricciones únicas por sucursal evitan repetir comanda o soporte incluso con solicitudes simultáneas. `soporteArchivoRef` acepta referencias `storage://...` o HTTPS; la foto/archivo debe residir en almacenamiento de objetos, no como binario en PostgreSQL ni en el contenedor efímero.

## Domicilios

- Los pedidos `DOMICILIO` exigen destinatario, teléfono, dirección y costo.
- Estados: pendiente de asignación, asignado, en ruta, entregado, no entregado y cancelado.
- El repartidor debe ser un usuario activo del mismo restaurante y con alcance compatible con la sucursal.
- El pedido sólo sale a ruta cuando cocina lo deja `LISTO`.
- La entrega al cliente cambia el Pedido a `ENTREGADO`.
- El costo de domicilio se conserva separado y se suma al total de la Venta.

## Configuración y representación impresa

- `PORCENTAJE_IMPUESTO` efectivo se aplica cuando un flujo directo/digital no informa un impuesto explícito.
- `PREFIJO_FACTURA` genera números internos deterministas `PREFIJO-SUCURSAL-VENTA`.
- `MONEDA` y `ZONA_HORARIA` efectivas se reflejan en la tirilla.
- Los reportes convierten límites de días y agrupaciones según la zona del restaurante/sucursal.
- La representación HTML de 80 mm escapa contenido y declara expresamente si no existe aceptación electrónica DIAN.
- El backend genera la representación; el navegador, tablet o agente local controla la impresora física.

## Integridad fiscal preventiva

- Una resolución vigente sólo cuenta como lista si tiene referencia segura de clave técnica.
- Un bloqueo asesor transaccional serializa la creación por restaurante/prefijo.
- Se rechazan resoluciones activas cuyos alcance, vigencia y rango se solapan.
- La integración, firma XAdES, habilitación y contingencia reales permanecen para la etapa de pruebas con proveedor y credenciales; no se fabrica aceptación DIAN.

## Endurecimiento adicional

- Contraseñas nuevas: mínimo diez caracteres.
- Listados operativos principales tienen límites defensivos mientras se completa paginación uniforme.
- Pruebas concurrentes de ocupación y soportes duplicados.

## Puerta de cierre

- 26 migraciones reproducibles desde base vacía.
- `npm run lint:check`, build, unitarias, E2E y auditoría de dependencias.
- Construcción Docker y health checks en ambiente aislado.

## Fuera de alcance honesto

- Adaptador real de proveedor tecnológico/DIAN, certificado, firma y set de habilitación.
- Almacenamiento de objetos concreto; SIGR conserva una referencia portable.
- Controladores físicos de impresora, que dependen del dispositivo y sistema operativo de cada restaurante.
- Notas crédito/débito y devolución monetaria, que requieren el proveedor fiscal real.
