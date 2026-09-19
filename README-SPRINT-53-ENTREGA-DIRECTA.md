# Sprint 53 — Productos de entrega directa dentro de la comanda

## Objetivo
Permitir productos que deben aparecer y quedar trazados en la comanda, pero que no requieren preparación (por ejemplo bebidas tomadas de nevera).

## Regla de negocio
- Todo producto sigue formando parte de Pedido y Comanda.
- `requierePreparacion=true` mantiene el flujo normal: PENDIENTE -> EN_PREPARACION -> LISTA.
- `requierePreparacion=false` representa entrega directa: PENDIENTE -> LISTA, sin pasar por EN_PREPARACION.
- Una línea de entrega directa sigue impresa y visible en KDS con la marca `ENTREGA DIRECTA`.
- Una comanda sólo de entrega directa no usa el temporizador/objetivo de preparación en KDS.
- En una comanda mixta, "Iniciar todos" sólo inicia las líneas que sí requieren preparación.
- La estación sigue siendo el destino/ruteo de la comanda; no determina si el producto requiere preparación.

## Compatibilidad
- Los productos existentes quedan con `requierePreparacion=true` por defecto.
- El snapshot de sincronización de Producto incluye el nuevo campo.
- Eventos de Producto antiguos que no traigan el campo se interpretan como `true` para mantener compatibilidad.

## Configuración para el piloto
En Productos, desmarcar `Requiere preparación` para gaseosas, cervezas, aguas u otros productos que se entreguen directamente. Si el restaurante no tiene bar, la estación puede seguir siendo Cocina/Preparación o la estación operativa que decidan usar para el ruteo/impresión.

## Prueba funcional mínima
1. Producto A con `Requiere preparación=true`.
2. Producto B con `Requiere preparación=false`.
3. Crear un pedido con ambos y enviar a preparación.
4. Verificar que ambos aparecen en la comanda impresa y KDS.
5. Verificar que B muestra `Entrega directa` y puede pasar directamente de Pendiente a Lista.
6. Pulsar `Iniciar todos`: A pasa a preparación; B no debe pasar a preparación.
7. Marcar A lista y B lista; la comanda termina LISTA.
8. Crear otra comanda sólo con B: no debe mostrar temporizador de preparación y debe poder marcarse lista directamente.
