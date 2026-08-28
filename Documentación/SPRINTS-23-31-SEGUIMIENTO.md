# Sprints 23–31: alcance y puerta de cierre

Esta matriz recupera la hoja de ruta acordada. Un tag anterior no sustituye la
verificación funcional. No se declarará terminado un sprint con criterios sin probar.

| Sprint | Alcance | Estado de esta revisión |
| --- | --- | --- |
| 23 | KDS por estación, alertas desde primera comanda, tiempos, prioridad, compacto/pantalla completa, entrega y aislamiento | En revisión; tag previo existente |
| 24 | Apertura/cierre de caja, movimientos, ventas pedido/directa/manual, pagos parciales/mixtos, recibo, reversos y concurrencia | Pendiente de cierre |
| 25 | Archivo operativo, búsqueda/autocompletar, soporte, borrador minimizable, originales, permisos, eliminación y exportación | Pendiente de auditoría completa |
| 26 | Catálogos, clientes, recetas, inventario por sede, movimientos compensatorios y alertas | Pendiente |
| 27 | Dashboard real, reportes y exportación, filtros, domicilios y distribución | Pendiente |
| 28 | Administración multiempresa, usuarios, roles, permisos dinámicos, onboarding y auditoría | Pendiente |
| 29 | Factura comercial, impresión, configuración fiscal y DIAN en pruebas sin aceptación ficticia | Pendiente; integración real requiere proveedor/habilitación |
| 30 | PWA, cola por actor/empresa, idempotencia, conflictos y recuperación; límites sin nodo local | Pendiente |
| 31 | Pruebas integradas por rol, concurrencia, offline, responsive, accesibilidad, seguridad, manuales, despliegue y rollback | Pendiente |

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

## Próximo paso obligatorio

Recuperar Docker/PostgreSQL **sin restablecer ni borrar datos**, comprobar migraciones
y repetir `npm run certify` en backend. Luego continuar por los bloques pendientes
de esta matriz. Ninguno de los Sprints 24–31 está declarado terminado por este documento.
