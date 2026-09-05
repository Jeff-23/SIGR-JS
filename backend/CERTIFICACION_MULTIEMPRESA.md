# Certificación funcional multiempresa

Este entorno crea datos ficticios persistentes para certificar SIGR contra backend y PostgreSQL. No reemplaza el modo demo y no debe ejecutarse en producción.

## Empresas

- Restaurante Costy: 1 sede, plan BASICO, escenario híbrido con comandas en papel y digitación posterior.
- Restaurante Sazón Urbano: 2 sedes (Bocagrande y Manga), plan PRO por la capacidad MULTISUCURSAL existente.
- Restaurante Sabores Colombianos: 3 sedes (Bacuyande, Centro y Castellana), plan PRO y escenario de mayor complejidad.

Total: 3 empresas y 6 sucursales.

## Datos generados por sede

- Zona principal y mesas.
- Estaciones Cocina y Bar.
- Categorías y catálogo propio con diferencias entre sedes.
- Usuarios limitados a sucursal: ADMIN_SEDE, CAJERO, MESERO, COCINA, BAR y DOMICILIARIO.
- Configuración básica de COP, America/Bogota y aceptación QR.

Por empresa también se crea un ADMIN general sin sucursal y un CONTADOR sin sucursal.

Los correos utilizan el dominio ficticio `cert.sigr.example`. La contraseña se recibe por variable de entorno y nunca se imprime.

## Ejecución

Primero ejecutar el seed base para garantizar planes, capacidades y permisos:

```powershell
cd C:\Users\User\Desktop\SIGR-JS\backend
$env:SEED_ADMIN_PASSWORD="<tu-password-local-seguro>"
npm run db:seed
```

Luego cargar el escenario de certificación:

```powershell
$env:CERTIFICATION_TEST_PASSWORD="<password-de-pruebas-de-al-menos-10-caracteres>"
npm run db:seed:certificacion
```

El seed es idempotente para los identificadores que administra: NIT, correos, roles y recursos encontrados por empresa/sucursal.

## Seguridad

El script aborta cuando `NODE_ENV=production` y exige `CERTIFICATION_TEST_PASSWORD`. Estos usuarios son exclusivamente ficticios.

## Observación de arquitectura

El modelo actual de `Caja` representa una sesión/apertura operacional, no un catálogo persistente de cajas físicas. Por eso este bloque no crea cajas abiertas de manera artificial. Las aperturas de caja se generarán durante la simulación del día de servicio.

## Siguiente bloque

Con los datos cargados se certificará el flujo real:

Login -> sucursal -> Salón -> Pedido -> Cocina/Bar -> Servicio -> Caja -> Pago -> Comprobante -> liberación de mesa.

Cada paso se clasificará como REAL, PARCIAL, SIMULADO, NO CONECTADO o ERROR y se validará también el aislamiento negativo entre empresas y sucursales.
