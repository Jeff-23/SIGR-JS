# S56 — Carta del día dinámica

Este bloque se preparó sobre el ZIP actual entregado por el usuario.

## Qué resuelve

No existe calendario fijo de especiales.

Cada fecha tiene una carta independiente y completamente editable:

- título y subtítulo;
- precio base;
- especial del día libre: nombre, descripción y precio opcional;
- secciones libres con nombre y opciones, por ejemplo:
  - Proteínas disponibles;
  - Acompañamientos;
  - Sopa;
  - Bebidas;
  - Postres;
  - cualquier otra sección creada por el restaurante;
- mensaje final;
- estado publicado/borrador.

Cambiar el especial mañana no modifica el catálogo maestro ni obliga a crear
un producto permanente.

## Salidas desde la misma pantalla

- Vista previa profesional.
- `Imprimir / PDF`: abre una versión A4 limpia y usa el diálogo de impresión
  del navegador, que permite imprimir físicamente o guardar como PDF.
- `Descargar PNG`: genera una pieza vertical 1080x1350 apropiada para
  WhatsApp, estados y redes sociales.

## Menú QR

Si la carta de la fecha actual está marcada como publicada, el menú QR la
muestra antes del catálogo normal. El modo QR sigue siendo independiente:
SOLO_MENU, PEDIDO_CON_APROBACION o PEDIDO_AUTOMATICO.

## Alcance

Este bloque es local/EDGE. No publica todavía la carta por Internet.
La publicación pública gratuita será el siguiente bloque y podrá reutilizar
exactamente `CartaDia`.

## Permisos

La edición usa `PRODUCTOS_EDITAR`, evitando ampliar permisos generales de
Configuración. Los usuarios operativos sin ese permiso no ven la opción
`Carta del día`.
