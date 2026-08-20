# Sprint 15 — Plataforma fiscal multiproveedor

Fecha: 20 de agosto de 2026. Alcance: backend preparado para incorporar restaurantes y adaptadores fiscales reales sin acoplar la plataforma a un único proveedor.

## Objetivo de negocio

Permitir que SIGR atienda múltiples restaurantes. Cada empresa conserva su perfil fiscal, referencias de secretos, ambiente, resolución y documentos. Dar de alta un cliente cuyo proveedor ya esté soportado es una operación de configuración; no requiere modificar lógica comercial ni compartir credenciales entre tenants.

## Entregado

- Contrato `ProveedorFiscalAdapter` para diagnosticar, transmitir y consultar mediante respuestas normalizadas.
- Registro de adaptadores por código, insensible a mayúsculas y con rechazo de duplicados.
- Diagnóstico por restaurante que separa `listoConfiguracion` de `listoTransmision`.
- Resumen operativo por tenant con conteos de documentos y outbox por estado.
- Encolado explícito e idempotente sólo para documentos `NUMERADO` y proveedores registrados.
- Procesamiento de outbox limitado al tenant del actor, reclamo transaccional, máximo cinco intentos y espera exponencial.
- Consulta explícita de estados pendientes mediante el mismo adaptador y referencia del proveedor.
- Aceptación fiscal bloqueada si la respuesta no contiene referencia, CUFE y QR verificables.
- Historial append-only para cola, respuestas y reintentos.
- Pruebas de aislamiento, diagnóstico y fallo cerrado ante un proveedor no instalado.

## Alta de un restaurante

1. Crear restaurante, plan, sucursales, usuarios y roles con los flujos administrativos existentes.
2. Recopilar NIT, razón social, responsabilidad fiscal, municipio, actividad económica y modo de operación.
3. Seleccionar un proveedor soportado y cargar sus credenciales en el gestor de secretos. SIGR sólo recibe referencias `secret://...`.
4. Registrar resolución, prefijo, rango, vigencia y referencia segura de clave técnica.
5. Ejecutar `GET /fiscal/restaurantes/:id/diagnostico` hasta obtener `listoTransmision: true` en habilitación.
6. Completar pruebas y habilitación exigidas por DIAN/proveedor antes de cambiar a producción.

## Contrato para integrar proveedores

Un adaptador real se registra una vez en `ProveedorFiscalRegistry` al iniciar el backend y encapsula autenticación, firma, endpoints, mapeo de estados y consulta propios del proveedor. El adaptador debe resolver secretos fuera de la base, conservar evidencia original y devolver estados normalizados. Agregar un restaurante a un proveedor ya integrado sólo requiere datos fiscales.

## Restricciones deliberadas

- Esta entrega no afirma habilitación DIAN ni contiene credenciales de un cliente real.
- No existe adaptador de simulación en producción. Un código desconocido nunca encola ni marca aceptación.
- El procesamiento se expone como operación controlada para poder ejecutarse desde un worker/orquestador; la programación recurrente pertenece a infraestructura.
- Notas crédito/débito, firma XAdES y contingencia específica se implementarán al contratar el primer proveedor, conforme a su API y al anexo DIAN vigente.
- Comanda, Pedido, Venta, Pago, Factura y Documento Electrónico continúan separados.

## Puerta de cierre

- `npm run lint:check`
- `npm run build`
- 24 pruebas unitarias
- 34 pruebas E2E
- `npm run certify:ci`
- migraciones reproducibles desde base vacía y arranque Docker saludable
