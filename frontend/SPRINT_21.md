# Sprint 21 — Núcleo frontend y conexión real

## Objetivo

Establecer una base común para que las pantallas de SIGR consuman el backend sin duplicar autenticación, autorización, selección de sucursal ni manejo de errores.

## Implementado

- Sesión validada al restaurarse desde `sessionStorage` y cierre centralizado.
- Cierre automático ante `401` y actualización del contexto con `GET /auth/sesion` usando el mismo JWT.
- Permisos y capacidades centralizados para menú y rutas.
- Contexto dinámico de restaurante y sucursal; los usuarios limitados no pueden ampliar su alcance.
- Cliente HTTP uniforme con tiempo límite, correlación `X-Request-Id` y clasificación segura de errores.
- Estados reutilizables de carga, vacío, error, acceso denegado y servicio no disponible.
- Límite global de errores de React.
- Configuración de API por ambiente. Producción sin `VITE_API_URL` queda identificada como demo y no intenta autenticarse contra `localhost`.
- Reportes reales para sesiones reales; la información ficticia se conserva exclusivamente en modo demo.
- Configuración efectiva real por sucursal con guardado auditado según permisos.
- Pruebas unitarias de autorización, configuración de entorno y errores de API.

## Fuera de alcance

- Renovación mediante refresh token: el backend actual usa JWT con expiración y exige nuevo inicio de sesión.
- Despliegue del backend y PostgreSQL en un proveedor público.
- CRUD completo de los módulos operativos, abordado desde Sprint 22.
- DIAN real, reservado para Sprint 29.

## Puerta de cierre

- `npm run certify` en frontend.
- `npm run lint:check` y `npm run build` en backend.
- Suite backend crítica y migraciones sin cambios pendientes.
- Publicación privada identificada como demo mientras no exista `VITE_API_URL` de producción.
