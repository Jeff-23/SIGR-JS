# Sprints 23–31: alcance y puerta de cierre

Esta matriz recupera la hoja de ruta acordada. Un tag anterior no sustituye la
verificación funcional. No se declarará terminado un sprint con criterios sin probar.

| Sprint | Alcance | Estado de esta revisión |
| --- | --- | --- |
| 23 | KDS por estación, alertas desde primera comanda, tiempos, prioridad, compacto/pantalla completa, entrega y aislamiento | Completo |
| 24 | Apertura/cierre de caja, movimientos, ventas pedido/directa/manual, pagos parciales/mixtos, recibo, reversos y concurrencia | Completo |
| 25 | Archivo operativo, búsqueda/autocompletar, soporte, borrador minimizable, originales, permisos, eliminación y exportación | Completo |
| 26 | Catálogos, clientes, recetas, inventario por sede, movimientos compensatorios y alertas | Completo |
| 27 | Dashboard real, reportes y exportación, filtros, domicilios y distribución | Completo |
| 28 | Administración multiempresa, usuarios, roles, permisos dinámicos, onboarding y auditoría | Completo |
| 29 | Factura comercial, impresión, configuración fiscal y DIAN en pruebas sin aceptación ficticia | Completo dentro del alcance de pruebas; producción requiere proveedor/habilitación |
| 30 | PWA, cola por actor/empresa, idempotencia, conflictos y recuperación; límites sin nodo local | Completo dentro del alcance PWA; continuidad multi-equipo requiere nodo local |
| 31 | Pruebas integradas por rol, concurrencia, offline, responsive, accesibilidad, seguridad, manuales, despliegue y rollback | Completo |

## Reglas transversales

- Pedido, venta, pago, factura comercial, archivo operativo y documento electrónico son entidades diferentes.
- Ningún filtro elegido en pantalla puede ampliar el alcance del usuario.
- Los datos de demostración nunca sustituyen una respuesta real fallida.
- Un pago sin confirmación del servidor no se muestra como cobrado.
- La cola sin conexión no se ejecuta bajo otro usuario, empresa o servidor.
- Cada bloque exige lint, compilación y pruebas críticas; el cierre exige evidencia integrada.
- No emitir `frontend-v1` ni tags de cierre hasta satisfacer los criterios.
- La publicación del frontend no implica que haya un backend HTTPS desplegado.
- Las pruebas DIAN reales y la continuidad entre dispositivos sin internet requieren
  credenciales/habilitación y pruebas de infraestructura, respectivamente.

## Evidencia del bloque 1 — 2026-08-28

Rama de trabajo: `codex/sprints-23-31-completion`, desde `23c50ee`.

Implementado (aún sin cierre integrado):

- Filtros de mesas, productos y estaciones intersectan sede solicitada y sede autorizada.
- Crear estación no permite sobreescribir el alcance del usuario.
- KDS no reactiva estaciones deshabilitadas ni enruta productos hacia una estación de otra sede.
- Seed conserva personalizaciones y estado de estaciones existentes.
- Finalizar un pedido histórico no libera una ocupación manual o pedido posterior.
- KDS muestra aviso persistente desde la primera carga de comandas, sonido habilitado
  por interacción, modo compacto y pantalla completa, tarjetas de altura uniforme.
- Fallos de actualización KDS se muestran y bloquean operaciones sobre datos obsoletos.
- Caja real separada de demo: apertura, consulta, historial, movimientos, arqueo/cierre,
  venta desde pedido entregado, pagos parciales/mixtos secuenciales, detalle,
  comprobante imprimible y anulación de ventas sin pagos.
- Pagos no se encolan: un intento incierto conserva su clave y cuerpo durante recarga
  en la misma pestaña, separado por servidor, usuario, restaurante y sede.
- Dashboard real consume `/dashboard/resumen`; ya no usa indicadores demo en sesión real.
- Cola de pedidos vinculada a actor/restaurante/servidor; operaciones antiguas sin
  propietario se conservan pero no se reproducen automáticamente. No hay migración destructiva.
- Sesiones reales no encolan escrituras arbitrarias de caja/archivo.
- Pedidos entregados y pagados dejan de ocupar la lista de servicio activo.

Verificado:

- Backend: lint de comprobación y build aprobados; 28 unitarias en 12 suites aprobadas.
- Frontend: lint y build aprobados; 20 unitarias en 7 archivos aprobadas.
- Preview local responde HTTP 200.
- Se agregaron dos pruebas integradas de regresión (ocupación nueva y filtro de sede),
  todavía pendientes de ejecución con PostgreSQL disponible.

Bloqueo reproducible:

- PostgreSQL `localhost:5433` rechaza conexión (`ECONNREFUSED`).
- E2E antes de las dos pruebas nuevas: 38 fallidas y 6 aprobadas; fallos de acceso a
  base de datos. Se repitió fuera del sandbox con el mismo resultado.
- Docker Desktop no arranca: su registro identifica un error de acceso al socket
  interno `AppData/Local/Docker/run/dockerInference`. Inicio normal y solicitud de
  reinicio no recuperaron la base durante este bloque.
- No se ejecutó restablecimiento de fábrica, eliminación de volúmenes, ni cambios
  destructivos del entorno. No se publicó ni creó un tag de cierre.

## Pendientes antes de afirmar Sprint 24 completo

- Ventas directa/manual con cliente, ajustes originales y sus formularios completos.
- Devoluciones/reversos append-only: el backend actual sólo anula ventas sin pagos;
  no presentar un egreso manual como devolución comercial.
- Pruebas integradas de cobro concurrente, respuesta perdida, recarga, arqueo y liberación.
- Accesibilidad completa de diálogos, navegación de teclado, impresión y QA visual.
- Idempotencia de apertura/movimientos/cierre ante respuesta perdida.
- Paginación/filtros de ventas y cajas más allá de la consulta reciente.

## Recuperación del entorno — 2026-08-28

Después de que el usuario abrió Docker, el motor respondió. El contenedor existente
`sigr-db` estaba detenido (Exited 255); se inició con `docker start sigr-db`, sin
recrear la base, borrar volúmenes ni restablecer Docker.

Se ejecutó `npm run certify` completo en backend sobre el código de `fb05f48`:

- Lint de comprobación: aprobado.
- Build: aprobado.
- Unitarias: 28 aprobadas, 12 suites.
- E2E: 46 aprobadas, 10 suites, incluidas ambas regresiones nuevas.
- Migraciones: 29 encontradas, esquema actualizado, ninguna pendiente.
- Resultado del comando: código de salida 0.

Observación no bloqueante: el driver `pg` emitió un aviso de deprecación sobre
consultas simultáneas en un mismo cliente. Revisarlo antes de actualizar a pg 9;
esta ejecución no modifica dependencias ni certifica esa versión futura.

El bloqueo de infraestructura descrito arriba queda **resuelto**. Esta evidencia
valida el bloque existente, no representa el cierre funcional de los Sprints 23–31
ni una certificación de producción/DIAN. Frontend, publicación y auditoría de
dependencias no se volvieron a ejecutar durante esta recuperación.

## Próximo paso obligatorio

Continuar por los bloques funcionales pendientes de esta matriz y ejecutar sus
pruebas críticas. Ninguno de los Sprints 24–31 está declarado terminado por este documento.

## Bloque 2 — Caja recuperable y archivo operativo — 2026-08-28

Implementado en la rama de trabajo, todavía sin cierre de sprint:

- Apertura, movimientos y cierre de caja aceptan clave idempotente, verifican el
  cuerpo y actor del intento y recuperan el resultado original. Migración aditiva
  `20260828160000_caja_reintentos_seguros`, aplicada sin borrar datos.
- El frontend conserva el intento financiero antes de enviarlo; permite reintentar
  con la misma clave y cuerpo. No lo confirma localmente ni lo pone en cola offline.
- Formularios reales de venta directa y manual: productos, cliente opcional,
  ajustes, datos originales y fecha colombiana. No generan pago ni factura implícitos.
- Archivo: borrador en sessionStorage separado por API, empresa, usuario, sede y
  registro; minimización, navegación y recarga. El archivo adjunto debe reseleccionarse.
- Si el registro se guarda pero falla su soporte, el formulario reintenta solamente
  el soporte; no vuelve a crear el registro.
- Filtros de origen, montos y fechas, paginación de 50 registros y CSV con los mismos
  filtros. Los días enviados a la API incluyen el intervalo completo de Colombia.
- Cambio de sede/actor remonta la pantalla; consultas previas se cancelan. Los errores
  de actualización no se ocultan ni se reemplazan por registros demo.
- Diálogo nativo con foco modal y etiquetas para fecha, cantidades y precios.

Evidencia:

- Backend `npm run certify`: lint/build, 28 unitarias y 47 E2E aprobadas; 30 migraciones
  al día. Nueva prueba: apertura/movimiento/cierre simultáneos, rechazo de cambio de
  montos y recuperación del movimiento después del cierre.
- Frontend: lint y build aprobados; 25 pruebas en 9 archivos aprobadas. Vitest requirió
  ejecución fuera del sandbox por un bloqueo de lectura del directorio padre.
- QA en navegador local, sesión demo: minimizar, navegar a Reportes y volver,
  recargar y recuperar `QA-BORRADOR-LOCAL` con su producto. No se guardó una factura real.
- QA de filtros demo: PAPEL y máximo 50.000 devuelve PAP-1842, total 45.360.
- Captura revisada del archivo y diálogo; no equivale a prueba de todos los tamaños,
  dispositivos o flujos reales de caja.

Pendientes explícitos: pruebas UI autenticadas de ventas/caja y soporte, reversos y
devoluciones comerciales, autocompletado desde pedido/venta/factura, validación robusta
de borradores corruptos y todos los bloques restantes de la matriz. No se publica ni
se etiqueta este bloque como producto final antes de completar esas validaciones.

## Cierre integrado — 2026-08-28

Los pendientes funcionales de la matriz quedaron implementados. El cierre incorpora:

- devoluciones de pago parciales o totales append-only, idempotentes y concurrentes;
  el efectivo genera un egreso enlazado en la caja original;
- reversión comercial sólo después de devolver todos los pagos, con registro de
  reversión e inventario compensatorio; una factura emitida exige flujo fiscal;
- filtros y paginación de ventas y cajas;
- autocompletado del archivo operativo desde pedido, venta o factura comercial;
- borradores corruptos controlados, recuperación de soportes y descarte explícito
  de pedidos offline pertenecientes a la sesión actual;
- manual operativo por rol, continuidad, correcciones y cierre diario.

Certificación final completa:

- Frontend: lint aprobado, 37 pruebas aprobadas, build de producción aprobado y
  auditoría con cero vulnerabilidades.
- Backend: lint y build aprobados, 28 unitarias y 48 E2E aprobadas; incluye cobro,
  devolución y reversión concurrentes.
- Prisma: cliente generado, 32 migraciones aplicadas y esquema al día.
- Docker: imagen multi-stage construida sin vulnerabilidades de producción; smoke
  aprobado con usuario no root `sigr`, readiness PostgreSQL 200 y base restaurada aislada.

La integración DIAN productiva continúa siendo una habilitación externa que requiere
credenciales, certificado, resolución y pruebas reales del proveedor. La continuidad
simultánea entre dispositivos sin internet continúa requiriendo infraestructura local;
ninguna de las dos se presenta como simulada o aceptada.
