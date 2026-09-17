# Sprint 48D-2E — Maestros operativos híbridos

Sincroniza EDGE ↔ CLOUD los maestros que afectan directamente la operación POS/salón:

- Categoria
- Producto
- ProductoModificador (embebido dentro del snapshot de Producto)
- Zona
- Mesa (solo configuración estructural; no replica ocupación/estado de servicio)

## Reglas importantes

- Producto no replica `stock`: el stock sigue siendo responsabilidad exclusiva de 48D-2C / MovimientoInventario.
- Mesa no replica `situacion`, `ocupacionManual`, `ocupadaManualEn` ni `ocupadaManualPorId`, para no pisar una operación de salón viva.
- Modificadores se reconcilián por producto + nombre y se desactivan si desaparecen del snapshot; no se borran si pueden tener trazabilidad histórica.
- Se añade `globalId` a Zona mediante migración aditiva.
- La sincronización sigue usando Outbox/Inbox e idempotencia ya certificadas en 48D-1/2A/2B.

Usuarios, roles y credenciales no se incluyen aquí. Se dejan para un bloque separado de identidad/autorización porque sincronizar autenticación junto con maestros operativos aumenta el riesgo y requiere reglas específicas para contraseñas, permisos y revocaciones.

## Certificación

1. Levantar/reconstruir el smoke híbrido.
2. Ejecutar `scripts/certificar-sync-48d2e.ps1`.
3. Resultado esperado: `SIGR SYNC 48D-2E OK`.
