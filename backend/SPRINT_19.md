# Sprint 19 — Archivo operativo de facturas y comprobantes

## Objetivo de negocio

Permitir que cada restaurante conserve y consulte por fechas y montos sus facturas o comprobantes internos, incluidos los digitados desde papel, sin convertirlos ni enviarlos automáticamente a DIAN.

## Separación de dominios

`Pedido ≠ Venta ≠ Pago ≠ Factura ≠ Registro operativo ≠ Documento electrónico`.

Eliminar un registro operativo no elimina ni modifica la venta, los pagos, la factura emitida ni el documento electrónico. La acción de eliminación permanece en la auditoría transversal con actor, tenant y correlación.

## Alcance entregado

- Persistencia independiente por restaurante y sucursal.
- Captura de fecha real, número, comanda, soporte, origen, valores originales, productos, impuestos, pagos, responsable y referencia de archivo.
- Congelación de valores históricos mediante instantáneas JSON.
- Alimentación automática al emitir una factura desde una venta.
- Digitación manual idempotente para operación en papel y sincronización posterior.
- Prevención de duplicados por factura, comanda, soporte y clave de idempotencia dentro de la sucursal.
- Consulta paginada por texto, fechas, montos, sucursal, origen y digitador.
- Totales consolidados del período y exportación CSV segura para Excel.
- Corrección controlada y eliminación física independiente con permiso granular.
- Rol `CONTADOR` preparado por restaurante con acceso de consulta y exportación.
- Interfaz responsive con actualización automática cada 15 segundos y modo demostración.

## Permisos

- `REGISTROS_FACTURA_VER`
- `REGISTROS_FACTURA_CREAR`
- `REGISTROS_FACTURA_EXPORTAR`
- `REGISTROS_FACTURA_ELIMINAR`

El `ADMIN` recibe todos los permisos. El rol base `CONTADOR` recibe consulta y exportación. Otros roles pueden configurarse mediante la autorización administrable.

## Archivos de soporte

El modelo conserva `soporteArchivoRef` y el backend permite cargar y descargar el archivo con autenticación. El binario no se guarda dentro de PostgreSQL. El Sprint 20 añadió almacenamiento protegido configurable mediante `SOPORTES_STORAGE_DIR`.

## Criterios verificados

- Un mismo soporte o comanda no puede duplicarse en una sucursal.
- Repetir una solicitud con la misma clave devuelve el mismo registro.
- Otro restaurante recibe `404`, sin revelar existencia del registro.
- Un perfil de consulta no puede eliminar.
- El administrador autorizado puede eliminar el registro operativo.
- La exportación respeta el alcance y neutraliza fórmulas de hoja de cálculo.
- La creación de documentos electrónicos continúa siendo un proceso separado y explícito.
