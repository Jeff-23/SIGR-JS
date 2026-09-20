# S56E — Fondo visible, PNG fiel y PDF funcional

Corrige tres fallos observados en la prueba funcional de S56D:

1. El arte de fondo quedaba oculto por tarjetas totalmente opacas.
   - Se agrega opacidad configurable de tarjetas (25%–100%).
   - El arte de fondo puede llegar hasta 75% de opacidad.
   - Un fondo subido usa `cover`; el logo usado como marca de agua conserva `contain`.

2. El PNG no conservaba logo/fondo.
   - El PNG ahora usa el logo compartido de identidad del restaurante.
   - El endpoint público de recursos de carta agrega CORS para permitir dibujar imágenes en canvas.
   - El PNG aplica el fondo real y tarjetas translúcidas.

3. Imprimir/PDF abría `about:blank`.
   - Se elimina el popup.
   - La carta se compone en un iframe de impresión, espera sus imágenes y abre directamente el diálogo del navegador.
   - Se fuerza `print-color-adjust: exact` para conservar fondos/colores.

No cambia el modelo de perfiles, productos, turnos ni inventario.
No requiere migración: `tarjetaOpacidad` vive dentro del JSON de plantilla.
