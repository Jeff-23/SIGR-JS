# Sprint 51 — Impresión operativa real

## Objetivo

Cerrar el flujo local EDGE de impresión térmica para comandas y precuentas sin mezclar Pedido, Venta, Pago ni Factura.

## Alcance implementado

- La precuenta conserva la representación HTML de 58/80 mm y ahora expone también una representación de texto para el agente local de Windows.
- El salón detecta el agente de impresión de SIGR y enumera las impresoras instaladas.
- La impresora de precuenta se guarda localmente por sucursal; no se sincroniza ni se sube al backend.
- Si hay agente e impresora seleccionada, la precuenta se envía directamente al agente local.
- Si el agente no está disponible o el usuario elige navegador, se conserva el fallback al diálogo de impresión del navegador.
- Si una impresión directa falla u offline, no se presenta como confirmada y no se dispara automáticamente una segunda impresión.
- El modal imprimible admite una barra de herramientas opcional sin alterar los flujos ya existentes de comandas y facturas.
- Las comandas mantienen el flujo previo de impresión/reimpresión auditada y prevención de solicitudes duplicadas en backend.

## Archivos del bloque

- `backend/src/modulos/pedidos/pedidos.service.ts`
- `frontend/src/components/PrintableDocumentModal.tsx`
- `frontend/src/lib/print-agent.ts`
- `frontend/src/lib/print-agent.spec.ts`
- `frontend/src/pages/RealSalonPage.tsx`
- `scripts/certificar-impresion-s51.ps1`

## Puerta de software

Ejecutar desde la raíz del repositorio:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\certificar-impresion-s51.ps1
```

La certificación física se realiza después con una impresora real o, provisionalmente, con una cola de Windows como Microsoft Print to PDF.

## Certificación física pendiente

1. Agente local detectado e impresoras enumeradas.
2. Comanda de cocina/bar: primera impresión y reimpresión explícita.
3. Impresora offline: error visible y sin confirmación falsa.
4. Precuenta: impresión directa 58/80 mm.
5. Fallback: agente detenido y uso del navegador.
6. Si existen dos impresoras: validar enrutamiento cocina/bar.

El sprint no se considera cerrado hasta completar la prueba física aplicable al nodo del restaurante.
