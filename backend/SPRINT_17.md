# Sprint 17 — Certificación operativa y piloto

Fecha: 20 de agosto de 2026. Alcance: backend, automatización de CI y protocolo de incorporación; sin frontend ni aceptación DIAN ficticia.

## Objetivo de negocio

Convertir la certificación técnica acumulada en una puerta repetible para desplegar SIGR ante múltiples restaurantes. El resultado debe demostrar instalación desde base vacía, arranque real del contenedor y estabilidad básica, además de indicar qué evidencias dependen de cada cliente y proveedor.

## Entregado

- CI fija Node 22/npm 10.9.8, instala desde lock y usa PostgreSQL real.
- Compose construye `migration` y `backend`, aplica las 26 migraciones sobre una base vacía y espera readiness.
- Health y readiness se consultan desde fuera del contenedor.
- `pilot-load.mjs` ejecuta carga GET acotada, valida JSON/estado, calcula p50/p95/p99 y falla por errores o latencia.
- Los contenedores y volúmenes temporales se eliminan incluso cuando una puerta falla.
- Protocolo de piloto con datos de onboarding, casos funcionales, aislamiento, caja, papel, domicilio, inventario, factura, fiscal, backup y capacidad.

## Criterios de aceptación

- `npm ci` funciona en Linux limpio con la versión fijada.
- Lint, build, unitarias, E2E, migraciones y auditoría quedan verdes.
- La imagen productiva arranca como usuario no root después de migrar una base vacía.
- `/health/live` y `/health/ready` responden correctamente.
- Cien solicitudes concurrentes controladas tienen cero errores y p95 menor o igual a un segundo en CI; el entorno de capacidad usa un límite de throttling separado para no medir rechazos antiabuso como fallos de rendimiento.
- El protocolo diferencia expresamente certificación técnica, aceptación del cliente y habilitación DIAN.

## Fuera de alcance

- Diseño e implementación del frontend V2.
- Adaptador, credenciales, certificado, XAdES y habilitación DIAN reales.
- Impresoras, almacenamiento de objetos, gestor de secretos y monitoreo gestionado de un cliente concreto.
- Pruebas destructivas o de volumen sobre producción.

## Puerta de cierre

- Certificación local completa.
- Construcción y arranque Docker desde base vacía.
- Prueba de carga de salud aprobada.
- Workflow remoto de GitHub Actions aprobado.
- Rama, merge, tag y versión de backend publicados.
