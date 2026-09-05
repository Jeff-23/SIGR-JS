# Planes comerciales SIGR

SIGR usa tres planes base. Los permisos del rol y las capacidades del plan se validan de forma independiente: una opción sólo queda disponible cuando ambos permiten la operación.

## BÁSICO — empieza a operar

- 1 sede incluida y máximo 1 sede.
- Salón y mesas.
- Pedidos y comandas.
- Cocina y bar / KDS.
- Caja y pagos.
- Clientes y catálogo operativo.
- Domicilios.
- Pedidos QR básicos.
- Configuración operativa y continuidad.

## MEDIO — controla tu restaurante

Plan recomendado para la mayoría de restaurantes. Incluye BÁSICO y además:

- Hasta 2 sedes incluidas; máximo 2 sedes.
- Inventario.
- Recetas.
- Catálogo visual.
- Reservas y lista de espera.
- Promociones y fidelización.
- Personal y turnos.
- Reportes operativos estándar.

Un restaurante de una sola sede puede elegir MEDIO por sus funciones de gestión, aunque no utilice la segunda sede.

## PRO — controla tu negocio completo

Incluye MEDIO y además:

- 3 sedes incluidas.
- Sedes 4 a 10 habilitables como sedes adicionales con costo incremental.
- Tope técnico/comercial inicial: 10 sedes activas por restaurante; superar el tope requiere ajuste comercial.
- Proveedores y abastecimiento avanzado.
- Costos y rentabilidad avanzada.
- Cuentas por pagar.
- Multicaja.
- Analítica e inteligencia avanzada.
- Centro Operativo.
- Administración y lectura consolidada multisucursal.

## Estrategia de sedes

La capacidad `MULTISUCURSAL` se habilita desde MEDIO. El número de sedes no se modela sólo como un booleano: el plan define `sedesIncluidas` y `maxSedes`.

- BÁSICO: 1 incluida / 1 máximo.
- MEDIO: 2 incluidas / 2 máximo.
- PRO: 3 incluidas / 10 máximo.

En PRO, una sede por encima de `sedesIncluidas` se considera adicional a efectos comerciales. La facturación automática de ese adicional se implementará en la capa futura de suscripciones; el límite operativo ya queda protegido por backend.

## Regla de seguridad

Ocultar una opción en el frontend no concede ni revoca acceso por sí solo. Los módulos sujetos a plan usan también `CapabilitiesGuard` en backend. El permiso del rol continúa siendo obligatorio además de la capacidad comercial.
