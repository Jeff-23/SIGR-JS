# S53 — Fix certificación sync v2

Este parche corrige un falso negativo del script de certificación.

La implementación actual del consumidor sync ya conserva compatibilidad con eventos antiguos mediante:

```ts
p.requierePreparacion === undefined
  ? true
  : booleano(p.requierePreparacion, 'producto.requierePreparacion')
```

La versión anterior del script sólo aceptaba literalmente `requierePreparacion ?? true`.
Ambas formas son equivalentes para este contrato.

Este parche sólo reemplaza:

- `scripts/certificar-entrega-directa-s53.ps1`

No modifica lógica de negocio, Prisma, backend ni frontend.
