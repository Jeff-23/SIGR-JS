# Manual operativo SIGR V1

## Alcance

SIGR separa pedido, venta, pago, factura comercial, archivo operativo y documento electrónico. Registrar uno nunca implica crear automáticamente los demás.

## Flujo diario por rol

- Mesero: ocupa una mesa, crea el pedido y envía sus líneas a preparación. También puede liberar una mesa ocupada sin consumo cuando no existe pedido activo.
- Cocina y bar: reciben la comanda por estación, confirman preparación, marcan lista y entregada. Las alertas visuales aparecen desde la primera comanda; el sonido requiere una interacción previa del navegador.
- Servicio o caja: finaliza la entrega, crea la venta desde el pedido, registra pagos parciales o mixtos y libera la mesa cuando entrega y pago están completos.
- Cajero: abre la caja, registra movimientos justificados, cobra, imprime el comprobante y cierra con arqueo. Un comprobante no es factura electrónica.
- Digitador: archiva facturas en papel con comanda, soporte, valores e impuestos originales. Puede minimizar el formulario, recuperar el borrador y autocompletar desde pedido, venta o factura comercial.
- Administrador: gestiona catálogos, inventario, usuarios, configuración y auditoría dentro de su empresa. Las eliminaciones del archivo requieren permiso explícito y quedan auditadas.
- Contador: consulta y exporta el archivo operativo y los reportes autorizados. El archivo operativo no se envía a DIAN.

## Correcciones y reversos

- Un pago confirmado nunca se elimina: se registra una devolución append-only. Si fue efectivo, exige la caja original abierta y genera un egreso enlazado.
- Una venta con pagos sólo se revierte cuando todos sus pagos fueron devueltos. La reversión conserva la venta original y crea movimientos compensatorios de inventario.
- Una venta facturada no admite reversión comercial directa; exige nota crédito o procedimiento fiscal.
- Un documento electrónico conserva sus propios estados. SIGR no simula aceptación DIAN cuando el proveedor real no está habilitado.

## Caídas de conexión

Sólo la creación de pedidos puede quedar en cola local. La cola pertenece al servidor, usuario y restaurante que la creó. Pagos, cierres, inventario, facturación y administración requieren respuesta confirmada del backend. Antes de descartar un pedido pendiente, el usuario debe comprobar que el restaurante no lo recibió.

La continuidad simultánea entre varios dispositivos durante una caída requiere red local, nodo operativo y respaldo eléctrico; la PWA por sí sola no reemplaza esa infraestructura.

## Inicio y cierre de operación

1. Verificar sede, conexión, estación y caja abierta.
2. Confirmar que no existan operaciones financieras inciertas ni pedidos locales pendientes.
3. Al cierre, sincronizar pedidos, revisar comandas, cuadrar caja y exportar los reportes o el archivo requeridos.
4. Consultar auditoría ante cualquier eliminación, cambio administrativo o incidencia.

## Despliegue y recuperación

El despliegue, migraciones, backup, restauración y rollback se ejecutan con los procedimientos de `backend/DESPLIEGUE.md` y `backend/OPERACION.md`. Nunca se prueba una restauración sobre la base productiva original.
