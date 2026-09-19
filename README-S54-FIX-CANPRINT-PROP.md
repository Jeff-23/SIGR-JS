# S54 — Fix canPrint en CommandCard

El permiso `COMANDAS_IMPRIMIR` se calculaba en `RealKitchenPage`,
pero el botón de impresión vive dentro de `CommandCard`.

Este ajuste:
- pasa `canPrint` como prop a `CommandCard`;
- declara la prop en su contrato;
- renderiza `Imprimir/Reimprimir` sólo cuando `canPrint === true`.

No toca backend, permisos, migración ni lógica de impresión.
