# SIGR V2 — Despliegue Backend V1

## Orden seguro

1. Aprovisionar PostgreSQL y secretos fuera del repositorio.
2. Crear y verificar un respaldo restaurable.
3. Construir la imagen con `docker compose build backend migrate`.
4. Ejecutar `docker compose run --rm migrate`; nunca usar `prisma migrate dev` en producción.
5. Iniciar backend y comprobar `/health/live`, `/health/ready` y `/health/metrics`.
6. Habilitar tráfico sólo cuando `ready` responda 200.

La certificación acumulada se ejecuta con `npm run certify`. `POSTGRES_PORT` y `BACKEND_PORT` permiten levantar entornos aislados sin colisionar con desarrollo.

`backup.ps1` rechaza sobrescrituras y genera un archivo `.sha256`. `restore.ps1` exige ese checksum y aborta antes de tocar la base si la integridad no coincide. El cifrado, la retención y la copia fuera del servidor deben aplicarse en el almacenamiento administrado del entorno.

El servicio `migrate` del compose aplica migraciones antes de iniciar el backend. Una migración destructiva requiere estrategia expand/contract y respaldo probado. El rollback de aplicación consiste en desplegar la imagen anterior; el rollback de datos se realiza exclusivamente desde un respaldo verificado, nunca borrando migraciones ya aplicadas.

## Checklist

- [ ] `NODE_ENV=production`, JWT de 32+ caracteres y CORS HTTPS exacto.
- [ ] Swagger deshabilitado salvo acceso administrativo explícito.
- [ ] Proxy confiable configurado únicamente detrás del balanceador conocido.
- [ ] Límite de solicitudes calibrado y alarmas sobre 5xx/latencia.
- [ ] Migraciones, seed controlado, lint, build y E2E aprobados.
- [ ] Backup cifrado, retención definida y restauración ensayada.
- [ ] Logs JSON centralizados por `correlacionId`, sin cuerpos ni secretos.
- [ ] Scraping de `/health/metrics` configurado y alertas externas sobre tasa 5xx y latencia.
- [ ] Separación Pedido/Venta/Pago/Factura/Documento Electrónico verificada.
- [ ] Adaptador fiscal real registrado y diagnóstico del restaurante aprobado primero en habilitación.
- [ ] Gestor de secretos resuelve todas las referencias `secret://...` sin registrar sus valores en logs.
- [ ] Almacenamiento de objetos resuelve referencias `storage://...` de soportes y aplica retención por tenant.
- [ ] Agente de impresión local configurado por sucursal; el backend no accede directamente a impresoras privadas.
- [ ] Zona horaria, moneda, impuesto y prefijo de factura verificados por sucursal.

## Respaldo y restauración

```powershell
.\scripts\backup.ps1 -OutputFile C:\respaldos\sigr.dump
.\scripts\restore.ps1 -InputFile C:\respaldos\sigr.dump -ConfirmRestore
```

La restauración debe ensayarse primero en una base aislada y validarse con `npx prisma migrate status` y la suite E2E.

## Backlog fuera de Backend V1

- Frontend V2 alineado al contrato vigente.
- Adaptadores reales de proveedores seleccionados, firma, habilitación y contingencias según contrato.
- Devoluciones comerciales y notas crédito/débito completas.
- Métricas externas persistentes, trazas distribuidas y alertamiento gestionado.
- Almacenamiento de documentos y adjuntos, cuando exista requisito aprobado.
