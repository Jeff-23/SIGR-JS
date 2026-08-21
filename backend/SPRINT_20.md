# Sprint 20 — Finalización del archivo operativo

## Objetivo

Completar los pendientes de uso cotidiano del archivo de facturas: soportes físicos protegidos, corrección desde la interfaz y consultas rápidas para cierres diarios o mensuales.

## Entregado

- Carga autenticada de JPG, PNG, WEBP y PDF hasta 5 MB.
- Validación de extensión, MIME y firma binaria para impedir archivos disfrazados.
- Nombres aleatorios, almacenamiento fuera del directorio público y descarga sujeta a tenant, sucursal y permiso.
- Sustitución segura del soporte anterior y eliminación conjunta cuando el administrador borra el registro.
- Corrección de registros desde la interfaz sin modificar Venta, Pago, Factura o Documento Electrónico.
- Apertura protegida del soporte desde el archivo operativo.
- Accesos rápidos a los períodos “Hoy” y “Este mes”.
- Actualización automática de consultas mientras existe conexión.

## Operación productiva

`SOPORTES_STORAGE_DIR` define el volumen persistente del backend. En contenedores o servidores múltiples debe apuntar a un volumen compartido con backup. PostgreSQL conserva únicamente la referencia protegida; los binarios no se mezclan con la contabilidad.
