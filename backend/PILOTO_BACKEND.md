# Protocolo de piloto operativo del backend

Este protocolo certifica una instalación concreta de SIGR sin confundir pruebas internas con habilitación DIAN. Debe ejecutarse primero en un ambiente aislado y luego repetirse, con evidencias, para cada restaurante y sucursal que entre en producción.

## Datos que debe entregar el restaurante

- Razón social, NIT, responsabilidades fiscales, municipio y actividad económica.
- Sucursales, zonas, mesas, moneda, zona horaria, impuestos y prefijo interno.
- Usuarios responsables y matriz de roles/permisos.
- Catálogo inicial, recetas, unidades y política de inventario.
- Medios de pago, operación de caja y responsables de cierres.
- Flujo de salón, mostrador, para llevar y domicilio.
- Política y numeración de comandas de papel.
- Proveedor DIAN, ambiente, resolución y referencias del gestor de secretos, cuando aplique.
- Política de retención de soportes, backups y auditoría.

## Casos obligatorios de aceptación

| Área | Caso | Evidencia mínima |
|---|---|---|
| Acceso | Login válido, credenciales inválidas y usuario inactivo | Respuestas y `X-Request-Id` |
| Tenant | Intento de consultar o mutar recursos de otra empresa/sucursal | Rechazo 403/404 sin fuga de datos |
| Mesa | Ocupación sin pedido, liberación sin consumo y pedido normal | Auditoría y estados de mesa |
| Cocina | Comandas parciales hasta entrega | Tiempos y transición del Pedido |
| Caja | Apertura, pagos concurrentes, cierre y descuadre controlado | Caja, Venta y Pagos separados |
| Papel | Digitación con comanda, soporte, precios e impuestos originales | Actor, archivo referido y bloqueo de duplicado |
| Domicilio | Asignación, salida, entrega y no entrega | Pedido y Domicilio independientes |
| Inventario | Consumo por venta y movimiento compensatorio | Movimientos append-only |
| Factura | Representación interna y separación del documento electrónico | HTML seguro y leyenda fiscal correcta |
| Fiscal | Proveedor ausente o incompleto | Diagnóstico cerrado, nunca aceptación ficticia |
| Operación | Backup, checksum, restauración y rollback de aplicación | Registro fechado y conteos reconciliados |
| Capacidad | Health/readiness bajo carga controlada | Resultado JSON de `pilot:load` |

## Carga segura y reproducible

La prueba incluida realiza únicamente solicitudes GET contra un endpoint de salud; no genera ventas ni altera información:

```bash
npm run pilot:load -- --url https://api.example.com/health/ready --requests 500 --concurrency 20 --p95-ms 1000
```

El proceso falla si existe una respuesta no exitosa, JSON inválido, timeout o si el percentil 95 supera el umbral. El límite de throttling del ambiente de capacidad debe superar el volumen ensayado; los rechazos 429 de la política antiabuso se prueban por separado. Esto es una prueba de humo y capacidad básica, no sustituye una prueba de carga sobre la infraestructura dimensionada.

## Puertas externas que no pueden autoaprobarse

- Aceptación del flujo por meseros, caja, cocina, administración y domicilios.
- Impresión física en cada modelo de dispositivo.
- Resolución de referencias `storage://` y `secret://` por los servicios contratados.
- Restauración desde el almacenamiento de backup definitivo.
- Habilitación, firma, transmisión, rechazo, contingencia y notas fiscales con proveedor real.

Cada puerta debe registrar fecha, ambiente, restaurante, sucursal, responsable, resultado, evidencia y acción correctiva. Sin esas firmas el sistema está certificado técnicamente, pero no aceptado operativamente por el cliente.
