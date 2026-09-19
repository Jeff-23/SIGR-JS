# S56D — Perfiles de carta, turnos e identidad visual

Este bloque corrige el modelo de S56 para que una sucursal pueda tener varias cartas independientes sin duplicar sede, catálogo ni inventario.

## Modelo

- `PerfilCarta` pertenece a una sucursal y tiene `globalId` para quedar preparado para sincronización/Cloud futura.
- Cada perfil define sus categorías/productos, orden, diseño y activación.
- `CartaDia` ahora pertenece a un `PerfilCarta`, por lo que dos cartas pueden tener cambios diarios distintos en la misma fecha.
- La migración conserva la carta actual creando un perfil `Carta principal` y enlaza los `CartaDia` existentes.

## Activación

Cada carta puede ser:

- siempre disponible;
- por horario y días de semana;
- manual.

Si coinciden varias cartas activas, el QR permite elegir entre ellas. Si ninguna queda activa, se usa la carta marcada como respaldo/predeterminada.

## Identidad y diseño

- El logo se guarda como identidad del restaurante (`CARTA_IDENTIDAD`) y se comparte automáticamente entre todas las cartas.
- Cada carta puede tener su propio arte/fondo, colores, estilo, secciones y opacidad de marca de agua.
- Las fotos de productos son opcionales y vienen desactivadas por defecto.
- PNG, PDF/impresión y QR usan la misma composición.

## Ejemplo del restaurante actual

La misma sucursal puede configurar:

- `Almuerzos`: sopas, secos, asados, bebidas y especial variable del día.
- `Comidas rápidas`: perros, hamburguesas, patacones, arepas, picadas, bebidas, etc.

Las bebidas pueden aparecer en ambos perfiles sin duplicar el producto ni su inventario.

## Media

Logo y fondos se cargan como PNG/JPG/WEBP en el almacenamiento local de media. No se exponen rutas arbitrarias del equipo. El endpoint público de media usa un nombre UUID y cabeceras aptas para el QR.

## Alcance

S56D sigue siendo EDGE/local. La publicación pública gratuita y el transporte Cloud se conectarán después a `PerfilCarta`, sus recursos y su `globalId`; no se expone el EDGE a Internet.
