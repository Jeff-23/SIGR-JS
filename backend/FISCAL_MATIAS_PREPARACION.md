# Fiscal A-B — Preparación SIGR + MATÍAS

Estado: preparado estructuralmente, transmisión real bloqueada hasta confirmar contrato API/Sandbox.

## Objetivo

Dejar SIGR listo para operar como **Software Propio** por cada NIT y utilizar MATÍAS como infraestructura API fiscal, sin mezclar Pedido, Venta, Pago, Factura y Documento Electrónico.

## Ya preparado

- Perfil fiscal por restaurante/tenant.
- Ambiente DIAN `HABILITACION` / `PRODUCCION`.
- Proveedor `MATIAS` registrado como adaptador conocido.
- Referencias seguras `secret://` para:
  - Software ID.
  - PIN del software.
  - credencial API.
  - cuenta del proveedor cuando corresponda.
  - certificado digital.
- Numeraciones independientes para:
  - `FACTURA_ELECTRONICA_VENTA`.
  - `DOCUMENTO_EQUIVALENTE_ELECTRONICO_POS`.
- Prefijo DIAN limitado a 4 caracteres alfanuméricos.
- Fecha de autorización, rango, próximo consecutivo, vigencia y sucursal.
- Estado operativo derivado de la resolución: `PROGRAMADA`, `VIGENTE`, `POR_VENCER`, `AGOTANDOSE`, `VENCIDA`, `AGOTADA`, `INACTIVA`.
- Bloqueo transaccional para evitar asignación concurrente del mismo consecutivo.
- Validación de que la resolución usada corresponda al tipo de documento fiscal.
- Preparación explícita de FEV o POS electrónico sin transmitir automáticamente.
- Desactivación de una resolución sin eliminar su historial.
- Auditoría transversal de cambios de configuración y resoluciones.
- MATÍAS no transmite todavía: el adaptador falla de forma segura hasta completar el contrato oficial.

## Deliberadamente NO inventado antes de la reunión

- URL/endpoint definitivo de MATÍAS.
- Headers/autenticación exactos.
- Payload de FEV/POS/notas.
- Firma y validación de webhooks.
- Semántica exacta de idempotencia de MATÍAS.
- Quién es la fuente definitiva del próximo consecutivo durante integración.
- Flujo exacto para convertir POS electrónico a FEV cuando el adquirente lo solicite.
- Contrato de contingencia.

Estos puntos se completan únicamente con documentación/confirmación oficial de MATÍAS.

## Datos requeridos por NIT al pasar a Sandbox/Producción

1. NIT/RUT actualizado.
2. Software ID.
3. PIN del software almacenado como secreto.
4. Credencial API almacenada como secreto.
5. Certificado digital/identificador de custodia.
6. Resolución FEV, si aplica.
7. Resolución POS electrónico, si aplica.
8. Prefijos, rangos, vigencias y próximo consecutivo confirmado.
9. Datos tributarios y municipio.
10. Sucursal/punto de facturación cuando la numeración tenga alcance por sede.

## Puerta antes de producción

No habilitar `PRODUCCION` hasta verificar en Sandbox:

- alta de un NIT;
- Software ID/PIN;
- certificado;
- FEV aceptada;
- POS electrónico aceptado;
- CUFE/CUDE y QR verificables;
- XML/AttachedDocument;
- webhook autenticado e idempotente;
- consulta/reconciliación de estado;
- rechazo y reintento;
- nota crédito/débito;
- contingencia;
- aislamiento negativo entre dos NIT.
