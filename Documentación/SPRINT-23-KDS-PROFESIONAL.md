# Sprint 23 — KDS profesional y estaciones configurables

Fecha de cierre: 20 de agosto de 2026

## Objetivo

Convertir Cocina y Bar en un tablero productivo conectado al backend, multisucursal y extensible a cualquier estación que requiera cada restaurante.

## Alcance entregado

- Estaciones de preparación configurables por sucursal.
- Estaciones base Cocina y Bar creadas automáticamente.
- Asignación opcional de estación a cada producto.
- División automática de una orden mixta en comandas independientes por estación.
- Estados independientes PENDIENTE, EN_PREPARACION, LISTA y ENTREGADA.
- Prioridades NORMAL, ALTA y URGENTE.
- Tablero real filtrable por estación y estado.
- Tarjetas de altura uniforme con destino, número de pedido, número de comanda y observaciones.
- Temporizadores y semáforo de demora: advertencia desde 10 minutos y crítico desde 20.
- Alertas visuales y sonoras para comandas nuevas y listas.
- Preferencia sonora persistente en el dispositivo.
- Actualización automática cada cinco segundos y refresco manual.
- Contadores de por iniciar, preparando, listas y demoradas.
- Creación de estaciones desde el KDS para usuarios con permiso de configuración.
- Corrección de capacidad frontend de COMANDAS a KDS.
- Aislamiento de restaurante y sucursal aplicado a consultas, cambios de estado, prioridad y estaciones.

## Integridad de dominio

El KDS sólo administra preparación y entrega operativa. No crea ni modifica Venta, Pago, Factura o Documento Electrónico. El estado de Pedido continúa sincronizándose mediante reglas existentes.

## Evidencia

- Migración: 20260820230000_sprint23_kds_estaciones.
- Backend: lint y build verdes; 25 unitarias; 44 E2E.
- Frontend: lint y build verdes; 15 unitarias.
- Auditoría de dependencias sin vulnerabilidades altas.
- Base local con 29 migraciones al día.

## Fuera de alcance

- WebSockets administrados y notificaciones push fuera del navegador.
- Impresión física automática por estación.
- Hardware específico de cocina.
- Cobro y cierre comercial, reservado para Sprint 24.

