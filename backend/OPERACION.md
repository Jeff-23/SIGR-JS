# SIGR V2 — Operación del backend

Este documento describe el contrato operativo del Backend V1 consolidado en el Sprint 11. El frontend no forma parte de este alcance.

## Requisitos

- Node.js 24 LTS (misma línea usada por la imagen reproducible).
- PostgreSQL accesible mediante `DATABASE_URL`.
- Dependencias instaladas con `npm install`.
- Migraciones aplicadas con `npx prisma migrate deploy`.

Copie `.env.example` como `.env` y reemplace todos los valores de ejemplo. La aplicación valida el entorno antes de iniciar y falla de forma explícita si una variable obligatoria es inválida.

## Variables de entorno

| Variable              | Uso                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------- |
| `NODE_ENV`            | `development`, `test` o `production`.                                                       |
| `DATABASE_URL`        | URL PostgreSQL obligatoria.                                                                 |
| `JWT_SECRET`          | Secreto JWT; mínimo 32 caracteres en producción.                                            |
| `JWT_EXPIRES_IN`      | Duración como `30m`, `12h` o `7d`.                                                          |
| `PORT`                | Puerto HTTP; predeterminado `3000`.                                                         |
| `CORS_ORIGINS`        | Orígenes exactos separados por coma; sin `*`. En producción deben usar HTTPS.               |
| `THROTTLE_TTL_MS`     | Ventana del limitador en milisegundos.                                                      |
| `THROTTLE_LIMIT`      | Solicitudes permitidas por ventana.                                                         |
| `SEED_ADMIN_PASSWORD` | Contraseña usada únicamente al ejecutar el seed.                                            |
| `TIME_ZONE`           | Zona horaria IANA usada como referencia operativa, por ejemplo `America/Bogota`.            |
| `SWAGGER_ENABLED`     | Publica `/docs`; por defecto activo fuera de producción e inactivo en producción.           |
| `METRICS_ENABLED`     | Publica métricas básicas en `/health/metrics`.                                              |
| `TRUST_PROXY`         | Confía en un salto de proxy para IP/rate limiting; sólo detrás de infraestructura conocida. |

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
- `GET /health/metrics`: contadores Prometheus sin etiquetas ni datos de tenants.

Un orquestador debe usar `live` para reinicio y `ready` para decidir si envía tráfico. Ninguno de los dos endpoints expone configuración, empresas, sucursales o secretos.

## API y seguridad HTTP

Cuando `SWAGGER_ENABLED=true`, OpenAPI se sirve en `/docs` con esquemas Bearer e Idempotency-Key. En producción permanece deshabilitado por defecto. Helmet aplica cabeceras defensivas y el cuerpo HTTP se limita a 1 MiB. El rate limiting se configura por ambiente; `TRUST_PROXY` sólo debe activarse detrás del proxy controlado que elimina encabezados reenviados del cliente.

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

## Integridad comercial e idempotencia

La creación de ventas y el registro de pagos requieren el encabezado `Idempotency-Key`, con entre 8 y 100 caracteres válidos. Repetir la misma clave con el mismo cuerpo devuelve el recurso existente; reutilizarla con otro cuerpo responde `409 Conflict`. La clave se aísla por sucursal para ventas y por venta para pagos.

Factura y Documento Electrónico aplican idempotencia natural mediante sus relaciones uno a uno. Repetir la emisión de una factura para la misma venta o la preparación electrónica para la misma factura no crea duplicados.

## Flujo fiscal multiempresa

Una venta manual proveniente de una comanda de papel es un registro comercial y no crea automáticamente una factura. La secuencia fiscal requiere acciones explícitas y auditables: emitir Factura, preparar Documento Electrónico y asignar numeración mediante una resolución vigente. Configurar un perfil fiscal activo exige referencias `secret://...`; las credenciales y certificados nunca se reciben ni se almacenan en claro.

El estado `NUMERADO` significa únicamente que se reservó un consecutivo y se produjo un borrador con hash. No significa firma, transmisión ni aceptación DIAN.

Antes de operar un cliente debe consultarse `GET /fiscal/restaurantes/:id/diagnostico`. `listoConfiguracion` confirma datos, referencias y numeración; `listoTransmision` exige además un adaptador registrado y su diagnóstico satisfactorio. `POST /documentos-electronicos/:id/encolar` falla cerrado si el proveedor no está soportado. `POST /documentos-electronicos/procesar-cola` procesa únicamente documentos visibles para el tenant del actor, con reintentos acotados; una respuesta pendiente se actualiza explícitamente con `POST /documentos-electronicos/:id/consultar-estado`. Ninguna respuesta se considera `ACEPTADO` sin referencia, CUFE y QR verificables.

Las fechas de ventas manuales deben incluir `Z` o desplazamiento `±HH:mm`. PostgreSQL conserva el instante normalizado y `TIME_ZONE` identifica la zona operativa configurada. Los montos comerciales usan `Prisma.Decimal`, máximo dos decimales y la capacidad común `Decimal(12,2)`.

Los reversos de inventario son movimientos compensatorios: no borran salidas originales y `movimientoOrigenId` es único. Las ventas con pagos o factura siguen bloqueadas para anulación directa porque requieren flujos explícitos de devolución o reversión documental.

## Flujo operativo integral

Una mesa pagada no se libera antes de que el Pedido esté `ENTREGADO`. La ocupación sin pedido usa `PATCH /mesas/:id/ocupar-sin-pedido` y sólo puede terminar mediante `liberar-sin-consumo` si nunca se vinculó un pedido activo. El cierre verificable está disponible en `PATCH /pedidos/:id/finalizar-servicio`.

Los domicilios se crean dentro de un Pedido `DOMICILIO`; cocina lo deja `LISTO`, luego distribución gestiona asignación, salida y entrega mediante `/pedidos/domicilios/:id/estado`. Pago y entrega permanecen independientes.

Las ventas manuales requieren soporte, comanda, precios e impuestos originales. `soporteArchivoRef` apunta a almacenamiento externo administrado. La API no recibe rutas locales del servidor ni guarda binarios en la base.

`GET /facturas/:id/representacion-impresa` genera HTML seguro para tirilla de 80 mm. Que exista una representación interna no implica que sea una factura electrónica aceptada. Sólo se muestran CUFE/QR como electrónicos cuando el Documento asociado está realmente `ACEPTADO`.
