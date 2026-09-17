# Fix 48D-2D v3 — usuario de certificación

Corrige el 500 en `loyalty/create-edge-flow`.

Causa: `prepararReferencias()` solo crea `Usuario` cuando también se pasan los métodos de pago usados por 48D-2B. El setup de 48D-2D sí enviaba `usuarioGlobalId`, pero no métodos de pago, por lo que el usuario nunca existía. `create-edge-flow` fallaba después en `usuario.findUniqueOrThrow()`.

El fix crea/upserta el usuario y un rol de certificación de fidelización tanto en EDGE como en CLOUD durante `prepararFidelizacion()`.

No cambia Prisma ni requiere migración.
