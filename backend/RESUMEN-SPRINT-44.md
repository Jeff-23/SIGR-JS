# Sprint 44 — Trazabilidad operacional e inteligencia de tiempos

## Objetivo
Convertir los cambios de estado operativos en una línea temporal persistente que permita medir dónde se pierde tiempo durante el servicio, no sólo analizar ventas después del cierre.

## Nuevo modelo
`EventoOperacional` registra, con tenant/sucursal, pedido, comanda, venta, actor, timestamp y metadata:

- PEDIDO_CREADO
- ENVIADO_ESTACION
- PREPARACION_INICIADA
- LISTO_ESTACION
- RETIRADO_ESTACION
- ENTREGADO_CLIENTE
- CUENTA_SOLICITADA
- PAGO_COMPLETADO

No sustituye auditoría; representa hitos del flujo operacional.

## Cambios funcionales
- KDS: la transición final se presenta como **Retirar para servicio**.
- Salón real: un pedido LISTO puede marcarse explícitamente **Entregado a mesa**.
- Solicitud de cuenta y pago completo generan hitos persistentes.
- `GET /pedidos/:id/trazabilidad`: línea temporal detallada.
- `GET /inteligencia/operacion-en-vivo?sucursalId=...`: operación actual, cuellos de botella y promedios.
- Inteligencia demo/real: nuevo panel **Operación en vivo** con estados, objetivos y alertas.

## Semántica importante
`Comanda.ENTREGADA` queda interpretada operacionalmente como retirada de la estación hacia servicio. El pedido ya no pasa automáticamente a ENTREGADO sólo por esa transición; el salón registra después la entrega al cliente. Esto separa:

**Listo → Retirado de estación → Entregado a mesa**.

## Métricas iniciales
- Pedido → estación
- Preparación → listo
- Listo → retirado
- Retirado → mesa
- Mesa → cuenta
- Cuenta → pago
- Ciclo total

La meta de preparación proviene de la estación. Los umbrales de espera de retiro/entrega/pago son iniciales y pueden hacerse configurables en un sprint posterior.
