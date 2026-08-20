# SIGR V2 — Operación del backend

Este documento describe el contrato operativo incorporado en el Sprint 9. El frontend no forma parte de este alcance.

## Requisitos

- Node.js compatible con NestJS 11.
- PostgreSQL accesible mediante `DATABASE_URL`.
- Dependencias instaladas con `npm install`.
- Migraciones aplicadas con `npx prisma migrate deploy`.

Copie `.env.example` como `.env` y reemplace todos los valores de ejemplo. La aplicación valida el entorno antes de iniciar y falla de forma explícita si una variable obligatoria es inválida.

## Variables de entorno

| Variable | Uso |
| --- | --- |
| `NODE_ENV` | `development`, `test` o `production`. |
| `DATABASE_URL` | URL PostgreSQL obligatoria. |
| `JWT_SECRET` | Secreto JWT; mínimo 32 caracteres en producción. |
| `JWT_EXPIRES_IN` | Duración como `30m`, `12h` o `7d`. |
| `PORT` | Puerto HTTP; predeterminado `3000`. |
| `CORS_ORIGINS` | Orígenes exactos separados por coma; sin `*`. En producción deben usar HTTPS. |
| `THROTTLE_TTL_MS` | Ventana del limitador en milisegundos. |
| `THROTTLE_LIMIT` | Solicitudes permitidas por ventana. |
| `SEED_ADMIN_PASSWORD` | Contraseña usada únicamente al ejecutar el seed. |

No deben versionarse archivos `.env`, secretos JWT, contraseñas ni tokens.

## Comandos de calidad

```bash
npm run lint:check
npm run build
npm test -- --runInBand
npm run test:e2e -- --runInBand
```

`npm run lint` modifica archivos; úselo solo en un bloque de formato controlado. `npm run lint:check` es la puerta de CI y no modifica el repositorio.

## Estado operativo

- `GET /health/live`: confirma que el proceso HTTP responde.
- `GET /health/ready`: confirma además que PostgreSQL acepta consultas.

Un orquestador debe usar `live` para reinicio y `ready` para decidir si envía tráfico. Ninguno de los dos endpoints expone configuración, empresas, sucursales o secretos.

## Errores y correlación

Todas las respuestas de error conservan `statusCode`, `message` y `error`, y agregan:

```json
{
  "timestamp": "2026-08-19T12:00:00.000Z",
  "path": "/recurso",
  "requestId": "identificador-de-correlacion"
}
```

El cliente puede enviar `x-request-id` con hasta 100 caracteres alfanuméricos más `.`, `_`, `:` o `-`. Si falta o es inválido, el backend genera un UUID. El mismo identificador se devuelve en la respuesta, aparece en logs estructurados y se conserva en auditoría.

Los errores inesperados se responden como `Error interno del servidor`; la traza queda en el log y nunca se entrega al cliente.

## Paginación

Los listados paginados aceptan `pagina` desde 1 y `limite` entre 1 y 100. El contrato común es:

```json
{
  "datos": [],
  "paginacion": {
    "pagina": 1,
    "limite": 20,
    "total": 0,
    "totalPaginas": 0
  }
}
```

## Concurrencia comercial

Ventas y cajas ejecutan sus operaciones críticas con aislamiento `Serializable`, bloqueos de fila donde corresponda y hasta tres intentos ante el conflicto transaccional Prisma `P2034`. Los errores funcionales no se reintentan.

Este endurecimiento no fusiona entidades ni responsabilidades: Pedido, Venta, Pago, Factura y Documento Electrónico siguen siendo conceptos separados. El aislamiento por restaurante y sucursal, los planes, capacidades y permisos continúan aplicándose en sus módulos y guards existentes.
