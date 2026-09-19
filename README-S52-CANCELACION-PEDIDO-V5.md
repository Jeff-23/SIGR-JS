# S52 V5 - bloqueo de cancelación según avance real por línea

Corrige la detección del avance de preparación en Salón.

El estado visible de preparación parcial se calcula desde `pedido.detalles[].comandas`, pero el bloqueo de cancelación V4 consultaba principalmente `pedido.comandas`. En respuestas donde `pedido.comandas` no viene completo, una línea podía estar `LISTA` y aun así mostrarse `Cancelar pedido` habilitado.

V5 usa ambas representaciones. Si cualquier línea está `EN_PREPARACION`, `LISTA` o `ENTREGADA` (y su comanda no está cancelada), la acción se muestra como `Cancelación bloqueada`.

No requiere migración ni cambios de backend.
