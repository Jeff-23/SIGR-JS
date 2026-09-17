# Sprint 48A — Identidad distribuida

Base para SIGR híbrido Edge + Cloud sin cambiar las claves primarias actuales.

## Qué cambia

Se añade `globalId UUID` único e inmutable a las entidades operativas y catálogos que deben poder ser referenciados entre la base local de la sucursal y SIGR Cloud.

Los `id Int` actuales se conservan. No se cambian rutas, DTOs ni relaciones existentes; por tanto este bloque es aditivo y de bajo riesgo.

## Por qué

Los autoincrementales pueden divergir cuando Local y Cloud crean registros mientras están desconectados. `globalId` será la identidad portable para sincronización, mientras `id` sigue siendo la clave interna local.

## Entidades cubiertas

Restaurante, Cliente, Sucursal, Usuario, Mesa, Categoria, Producto, EstacionPreparacion, Pedido, Domicilio, DetallePedido, Comanda, DetalleComanda, Venta, DetalleVenta, Articulo, MovimientoInventario, MetodoPago, Factura, Pago, Caja y MovimientoCaja.

## Aplicación

Desde `backend`:

```powershell
npx prisma migrate dev
npx prisma generate
npm run build
npm run sync:identity:certify
```

En producción se usará `npx prisma migrate deploy`, nunca `migrate dev`.

## Regla para los siguientes bloques

Los eventos de sincronización usarán `globalId`, no el `id` entero, como identidad entre Node y Cloud. La sincronización de eventos/outbox no se implementa todavía en 48A; corresponde al bloque 48D.
