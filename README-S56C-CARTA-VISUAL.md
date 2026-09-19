# S56C — Carta visual configurable

## Corrige el error al guardar la carta base

El frontend enviaba al DTO de escritura campos de lectura (`sucursalId` y
`actualizadoEn`). Con validación estricta del backend, eso producía:

- `property sucursalId should not exist`
- `property actualizadoEn should not exist`

Ahora el PUT envía únicamente los campos permitidos.

## Personalización visual nueva

La carta base ahora permite configurar:

- color de fondo;
- color de tarjetas;
- color de texto;
- color de acento;
- color del encabezado;
- imagen principal/portada elegida entre productos que ya tienen foto;
- mostrar u ocultar las fotos de productos;
- mostrar u ocultar precios.

No hay que volver a subir imágenes: reutiliza las imágenes del catálogo.

## Salidas

La misma configuración se utiliza en:

- vista previa;
- menú QR;
- impresión / PDF;
- PNG completo para WhatsApp y redes.

El PNG incluye la imagen de portada y las fotos de productos cuando están
habilitadas. Si el navegador no puede cargar una imagen para canvas, la salida
sigue generándose sin romper la carta.

## Datos

No requiere migración. Los nuevos campos viven dentro de `CARTA_PLANTILLA`,
que ya se guarda como JSON por sucursal.
