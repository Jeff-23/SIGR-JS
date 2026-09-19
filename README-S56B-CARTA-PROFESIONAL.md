# S56B — Carta profesional configurable

Este parche se aplica sobre S56A ya certificado. No añade migración nueva: la carta base se guarda en `ConfiguracionSucursal` bajo la clave interna `CARTA_PLANTILLA`.

## Cambio de enfoque

La carta ya no se arma desde cero cada día.

- **Carta base**: se configura una vez usando las categorías y productos reales del catálogo. Se pueden incluir/excluir categorías y productos, renombrar secciones, ordenarlas, elegir estilo y decidir si mostrar precios.
- **Carta de hoy**: normalmente sólo se cambia el especial, su descripción/precio opcional y un mensaje puntual.

## Salidas

La misma composición alimenta:

- vista previa;
- PNG completo vertical para WhatsApp/redes;
- impresión/PDF A4;
- menú QR público.

## Diseños

Incluye tres variantes visuales sobre la misma información: Editorial dorado, Contemporánea y Ejecutiva.

## Compatibilidad

No cambia los modos QR ni la creación de pedidos. `SOLO_MENU`, `PEDIDO_CON_APROBACION` y `PEDIDO_AUTOMATICO` siguen funcionando.
