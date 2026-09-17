# Sprint 48D — Certificación integral de cierre

Este parche no cambia backend, Prisma ni Docker.

Añade únicamente:

- `scripts/certificar-sync-48d-cierre.ps1`

La prueba usa los endpoints de certificación ya cerrados en 48D-2A..2G y ejecuta un escenario único:

1. prepara un mismo restaurante/sucursal;
2. corta el acceso de EDGE a Cloud una sola vez;
3. opera offline simultáneamente en operación, dinero, inventario, fidelización, maestros, seguridad y configuración;
4. verifica que la cola Outbox crece;
5. recupera Cloud;
6. drena EDGE -> CLOUD;
7. genera cambios CLOUD -> EDGE en todos esos dominios;
8. comprueba pull + ACK, convergencia e identidades;
9. ejecuta un ciclo extra para detectar duplicaciones;
10. comprueba que no quedan nuevos Inbox ERROR frente a la línea base.

No vuelve a ejecutar las certificaciones 48D-2A..2H como scripts separados.

Resultado esperado:

`SIGR SYNC 48D CIERRE INTEGRAL OK`

No requiere rebuild ni migración.

## Resultado de certificación

Estado: CERRADO Y CERTIFICADO

Comando ejecutado:

powershell -ExecutionPolicy Bypass -File .\scripts\certificar-sync-48d-cierre.ps1

Resultado final:

SIGR SYNC 48D CIERRE INTEGRAL OK

La certificación comprobó en un único escenario reproducible:

- pérdida total temporal de acceso EDGE -> CLOUD;
- operación offline simultánea en 7 dominios;
- crecimiento de Outbox durante la caída;
- recuperación de Cloud;
- drenaje EDGE -> CLOUD;
- cambios CLOUD -> EDGE;
- pull + ACK;
- convergencia bidireccional;
- idempotencia;
- ausencia de duplicación en pagos y movimientos;
- ausencia de nuevos Inbox ERROR;
- ciclo adicional at-least-once sin regresiones.

En la ejecución de cierre se acumularon 23 eventos durante la caída de Cloud.

No fue necesario modificar backend, Prisma, migraciones ni Docker para este cierre.