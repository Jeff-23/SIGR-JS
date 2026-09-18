# Sprint 49B — Fix de certificación de recuperación

Este ajuste corrige una carrera del certificador 49B, no la lógica productiva del diagnóstico.

El flujo anterior reencolaba el evento mientras el gateway Cloud seguía detenido. Como EDGE mantiene un ciclo automático, el evento podía ser reclamado inmediatamente y volver a `ERROR` antes de que Cloud estuviera disponible.

El flujo corregido:

1. detiene Cloud y genera el error controlado;
2. verifica que el error sea visible y reintentable;
3. recupera Cloud y exige varias respuestas `/health/ready` consecutivas;
4. ejecuta exactamente un reintento manual;
5. espera la convergencia sin reencolar repetidamente;
6. si el evento vuelve a `ERROR`, imprime `ultimoError` real para no ocultar la causa.

No modifica Prisma, servicios productivos, frontend ni la semántica at-least-once.
