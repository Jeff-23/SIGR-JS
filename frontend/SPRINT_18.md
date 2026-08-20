# Sprint 18 — Fundamentos Frontend V2

Fecha: 20 de agosto de 2026. Alcance: aplicación web responsive, integración inicial del contrato SIGR y continuidad offline del dispositivo.

## Objetivo

Reemplazar el prototipo monolítico por una base modular, accesible y adaptable a computador y tablet. El primer corte debe permitir comprender y ensayar el recorrido mesa → pedido → cocina/bar → listo, sin confundir datos demostrativos con información productiva.

## Entregado

- Identidad provisional SIGR con paleta Steel, Denim, Screen y Marigold.
- Login real contra `/auth/login` y acceso de demostración claramente identificado.
- Contexto de restaurante y selector de sucursal.
- Navegación filtrada por permisos del JWT dinámico.
- Dashboard operativo, mapa de 15 mesas y creación de pedido.
- Separación visual de productos para cocina y bar.
- KDS adaptable a monitor o interacción táctil.
- Restaurante El Mono con tres sucursales y catálogo colombiano demostrativo.
- PWA con caché exclusiva del shell; las respuestas de API no se almacenan en el service worker.
- Cola IndexedDB para mutaciones sin conexión, idempotencia y sincronización secuencial.
- Estado visible de conexión y operaciones pendientes.
- Sesión en `sessionStorage`; contraseñas y secretos nunca se persisten.
- CI propia con Node 22/npm 10.9.8, lint e imagen de producción.

## Restricción de continuidad

La PWA mantiene un dispositivo operativo durante una caída de internet. Para comunicar tablets, cocina y caja entre sí sin nube se requiere el futuro nodo local SIGR dentro de la red de la sucursal. Un apagón eléctrico exige UPS y dispositivos con batería; no puede resolverse sólo por software.

## Puerta de cierre

- `npm ci` limpio en Linux.
- Lint y build frontend verdes.
- Build y pruebas críticas del backend verdes por la ampliación de sesión.
- Flujo demo funcional en computador y tablet.
- CI remota verde.

## Fuera de alcance

- Caja, reportes y configuración completos.
- Nodo local multi-dispositivo.
- Impresión física y diseño definitivo de facturas.
- Identidad gráfica y logo definitivos.
