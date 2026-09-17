# SIGR Sprint 48D-2B — Fix v9

Basado en el SIGR-JS.zip actualizado del 2026-09-16.

Correcciones:
- El hash enviado se recalcula sobre el JSON realmente persistido y transmitido.
- Inbox conserva la recepcion/error aunque una transaccion de aplicacion haga rollback.
- El ciclo devuelve el error exacto por evento si una aplicacion falla.
- La certificacion limpia solamente residuos PENDIENTES de pruebas financieras anteriores para el peer de certificacion; no afecta produccion.

No cambia esquema Prisma, frontend, Venta/Pago/Caja de negocio ni despliegue.
