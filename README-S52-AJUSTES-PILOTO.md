# Sprint 52 — Ajustes operativos del piloto (v2)

Hallazgos corregidos sobre el flujo real del restaurante piloto:

1. Domicilio
   - Teléfono acepta sólo dígitos en la interfaz.
   - El valor del domicilio inicia vacío; `0` queda sólo como placeholder visual.
   - Se mantiene el desglose Productos + Domicilio + Total pedido.
   - Al crear el pedido el costo se normaliza a número y continúa formando parte del total comercial.

2. Unión de mesas
   - Un cajero/mesero con `PEDIDOS_CREAR` puede seleccionar mesas libres adicionales antes de crear el pedido.
   - La unión previa sigue siendo atómica en backend.
   - La acción `Unir mesa` de un pedido existente depende de `PEDIDOS_EDITAR`, no de permisos de configuración de mesas.
   - Trasladar/separar conservan `MESAS_EDITAR`.

3. Cancelación de pedidos
   - `PEDIDOS_CANCELAR` sigue siendo un permiso granular independiente.
   - El rol CAJERO creado por el seed de certificación recibe ese permiso por defecto.
   - La migración lo agrega de forma acotada sólo a roles con clave `RESTAURANTE:*:CAJERO` ya existentes.
   - El botón permanece visible para pedidos activos si el usuario tiene permiso; si preparación ya avanzó, backend bloquea la acción y devuelve el motivo.
   - Después de aplicar la migración, cerrar sesión e iniciar sesión nuevamente para renovar el JWT/permisos.

4. Estado parcial de preparación
   - Salón deja de resumir únicamente el estado global de la comanda.
   - Cuenta cantidades por línea de comanda (`PENDIENTE`, `EN_PREPARACION`, `LISTA`).
   - Una comanda con una línea lista y otra pendiente muestra `1/2 listas`.
   - En `Pedido actual`, cada producto muestra también cuántas unidades están listas.

5. Terminología
   - Se mantiene el cambio de `Cocina y bar` a `Preparación` en navegación/KDS general para no asumir que cada restaurante tiene bar.

## Comprobaciones realizadas en el entorno de preparación

- TypeScript frontend (`tsc -b`): OK.
- ESLint focalizado de archivos frontend modificados: OK.
- Backend Nest build: OK.
- Vitest focalizado no se pudo ejecutar en Linux porque el `node_modules` del snapshot proviene de Windows y carece del binario nativo Linux de Rollup. Ejecutarlo en Windows antes del despliegue.

## Pruebas Windows sugeridas

```powershell
cd C:\Users\User\Desktop\SIGR-JS\frontend
npm run lint
npm run test:unit -- src/features/salon/contracts.spec.ts
npm run build

cd ..\backend
npm run build
```

Después commit local y `scripts\\actualizar-edge.ps1` para aplicar la migración. Al terminar, cerrar sesión e iniciar sesión otra vez antes de comprobar el botón `Cancelar pedido` como CAJERO.
