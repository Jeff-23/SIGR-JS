# Certificación SIGR V2 Backend V1

Fecha: 20 de agosto de 2026. Alcance: backend exclusivamente.

## Puerta automatizada

```bash
npm run certify
```

Exige lint sin escritura, compilación, unitarias, E2E acumuladas y estado vigente de migraciones. La suite OpenAPI comprueba rutas mínimas, Bearer, Idempotency-Key y la separación Pedido/Venta/Pago/Factura/Documento Electrónico.

## Evidencia productiva ejecutada

- Compose aislado construido y arrancado en puertos alternos.
- Migraciones automáticas completadas antes de iniciar la API.
- `/health/live`, `/health/ready`, `/health/metrics` y `/docs-json` respondieron 200.
- Helmet entregó `X-Content-Type-Options: nosniff`; toda respuesta incluyó `X-Request-Id`.
- Dump PostgreSQL en formato custom restaurado en una base vacía.
- Origen y restauración coincidieron en 24 migraciones, 4 planes y 1 usuario semilla.
- Dos solicitudes de pago simultáneas con igual clave produjeron un único Pago.
- Imagen runtime ejecutada como usuario `sigr`, no root.

## Seguridad y dependencias

Los archivos `.env` están ignorados y no se versionan. La revisión busca patrones de claves privadas, tokens y secretos comunes en archivos rastreados. `npm audit` conserva tres avisos altos asociados a `deepmerge-ts` dentro del tooling/configuración Prisma; la corrección automática propuesta degrada Prisma 7 a 6 y no se acepta. No existe exposición HTTP directa conocida de esa utilidad.

## Rollback certificado

La aplicación puede volver a la imagen/tag anterior porque las migraciones son acumulativas. Los datos no se revierten borrando migraciones: se restaura un respaldo probado en una base nueva, se valida `prisma migrate status` y luego se conmuta el tráfico. Para cambios incompatibles futuros se exige expand/contract.

## Fuera de alcance

Frontend V2, DIAN real, firma electrónica, notas crédito/débito completas, devoluciones comerciales avanzadas, observabilidad gestionada y almacenamiento de adjuntos.
