# Sprint 19 — Facturas y comprobantes

La navegación incorpora una sección independiente para consultar, filtrar, consolidar, exportar, registrar y —cuando el JWT lo autoriza— eliminar registros operativos.

La pantalla muestra expresamente que registrar no equivale a enviar a DIAN. Las nuevas capturas en papel entran en la cola offline del dispositivo con idempotencia y se sincronizan al recuperar conexión. Las consultas se actualizan cada 15 segundos mientras existe conectividad.

La eliminación permanece deshabilitada sin conexión para evitar que una orden destructiva se reproduzca tardíamente sobre un registro distinto al que el usuario examinó.
