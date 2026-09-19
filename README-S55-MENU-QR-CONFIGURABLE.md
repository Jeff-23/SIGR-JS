# S55 — Menú QR configurable

## Objetivo

Separar la carta QR de la capacidad de ordenar.

### Modos

- `SOLO_MENU`: el cliente ve carta, precios e imágenes. No hay carrito ni creación de solicitudes.
- `PEDIDO_CON_APROBACION`: el cliente envía una solicitud y el restaurante debe aceptarla.
- `PEDIDO_AUTOMATICO`: la solicitud se convierte automáticamente en pedido.

El primer restaurante queda en `SOLO_MENU` por defecto.

## Seguridad

El backend bloquea `POST /publico/menu-qr/:token/solicitudes` cuando el modo es `SOLO_MENU`.
No depende únicamente de ocultar botones.

## Red local

El QR sigue usando `window.location.origin`:

- `localhost` / `127.0.0.1`: sólo sirve en el mismo PC.
- `192.168.x.x`, `10.x.x.x` o `172.16-31.x.x`: sólo sirve dentro de la misma LAN/Wi-Fi.
- Para clientes sin Wi-Fi se necesitará después una URL pública/servicio de publicación del menú. S55 no expone el EDGE a Internet.

## Configuración

En Configuración aparece `Modo del menú QR` con tres opciones. La clave antigua
`QR_REQUIERE_ACEPTACION` queda soportada internamente por compatibilidad, pero deja de mostrarse al usuario.

## Migración

`20260919120500_s55_modo_menu_qr` crea `QR_MODO = SOLO_MENU` para sucursales existentes.
