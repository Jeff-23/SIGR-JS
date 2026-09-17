# Sprint 43 — Ajuste final Caja/POS profesional

Este ajuste cierra los hallazgos detectados durante la validación visual del modo demostración.

## Hallazgos corregidos

- El campo **Monto aplicado** podía mostrar un valor superior al saldo pendiente aunque el pago luego fuera rechazado. Ahora se limita al saldo disponible.
- Se conserva **Efectivo recibido** como valor libre para que el cálculo de cambio funcione naturalmente.
- La lista de cobros pendientes incorpora búsqueda por mesa, pedido o mesero.
- El demo muestra cliente y permite editarlo antes del primer pago.
- La división de cuenta queda visible en la demostración mediante partes iguales; el POS real mantiene la división persistente por backend.
- Pago, comprobante, factura interna y documento electrónico quedan representados como operaciones independientes.
- La preparación electrónica en demo indica explícitamente que no existe envío DIAN real.
- Se incorpora impresión/reimpresión simulada en demo; el POS real conserva la representación imprimible proveniente del backend.

## Validación realizada en el entorno de preparación

- ESLint frontend: OK.
- TypeScript `tsc -b`: OK.
- El build Vite completo no pudo ejecutarse en Linux por ausencia del binding opcional `@rolldown/binding-linux-x64-gnu` dentro de los `node_modules` provenientes del ZIP. En Windows el build del Sprint 43 anterior ya fue exitoso y este ajuste debe certificarse nuevamente después de copiarlo.
