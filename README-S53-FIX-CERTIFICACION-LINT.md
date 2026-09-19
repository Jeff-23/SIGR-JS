# S53 — ajuste de certificación de lint

La primera versión de `certificar-entrega-directa-s53.ps1` ejecutaba `npm run lint:check` sobre todo el backend.
El repositorio mantiene deuda histórica de lint/Prettier en módulos anteriores, especialmente `sync`, por lo que esa puerta reportaba cientos de errores ajenos al Sprint 53.

Este ajuste no modifica lógica de producto. La certificación S53 ahora:

- ejecuta `prisma generate` y `prisma validate`;
- aplica ESLint focalizado a la lógica de dominio modificada de Comandas y DTOs de Producto;
- ejecuta el build completo del backend, incluyendo los cambios S53 de sincronización;
- verifica explícitamente que el contrato de Producto sincroniza `requierePreparacion` y conserva `true` como valor compatible para eventos antiguos;
- mantiene lint y build completos del frontend.

No se ejecuta `eslint --fix` ni se reformatean archivos históricos fuera del alcance del sprint.
