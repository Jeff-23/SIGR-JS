import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { ArticulosModule } from './modulos/articulos/articulos.module';
import { AuthModule } from './modulos/auth/auth.module';
import { CajasModule } from './modulos/cajas/cajas.module';
import { CategoriasModule } from './modulos/categorias/categorias.module';
import { ClientesModule } from './modulos/clientes/clientes.module';
import { DashboardModule } from './modulos/dashboard/dashboard.module';
import { ComandasModule } from './modulos/comandas/comandas.module';
import { DocumentosElectronicosModule } from './modulos/documentos-electronicos/documentos-electronicos.module';
import { FacturasModule } from './modulos/facturas/facturas.module';
import { InventarioModule } from './modulos/inventario/inventario.module';
import { MesasModule } from './modulos/mesas/mesas.module';
import { MetodosPagoModule } from './modulos/metodos-pago/metodos-pago.module';
import { PedidosModule } from './modulos/pedidos/pedidos.module';
import { ProductosModule } from './modulos/productos/productos.module';
import { RecetasModule } from './modulos/recetas/recetas.module';
import { ReportesModule } from './modulos/reportes/reportes.module';
import { RestaurantesModule } from './modulos/restaurantes/restaurantes.module';
import { SucursalesModule } from './modulos/sucursales/sucursales.module';
import { UsuariosModule } from './modulos/usuarios/usuarios.module';
import { VentasModule } from './modulos/ventas/ventas.module';
import { ZonasModule } from './modulos/zonas/zonas.module';
import { ConfiguracionModule } from './modulos/configuracion/configuracion.module';
import { AutorizacionModule } from './modulos/autorizacion/autorizacion.module';
import { AuditoriaModule } from './modulos/auditoria/auditoria.module';
import { AuditoriaInterceptor } from './modulos/auditoria/auditoria.interceptor';
import { obtenerEntorno } from './config/entorno';
import { CorrelacionMiddleware } from './plataforma/correlacion.middleware';
import { ExcepcionesFilter } from './plataforma/excepciones.filter';
import { TrazabilidadInterceptor } from './plataforma/trazabilidad.interceptor';
import { PlataformaModule } from './plataforma/plataforma.module';
import { RespuestaSeguraInterceptor } from './plataforma/respuesta-segura.interceptor';
import { FiscalModule } from './modulos/fiscal/fiscal.module';

const entorno = obtenerEntorno();

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: entorno.throttleTtlMs,
        limit: entorno.throttleLimite,
      },
    ]),
    PrismaModule,
    UsuariosModule,
    AuthModule,
    RestaurantesModule,
    SucursalesModule,
    CategoriasModule,
    MesasModule,
    ZonasModule,
    ProductosModule,
    InventarioModule,
    PedidosModule,
    ArticulosModule,
    RecetasModule,
    MetodosPagoModule,
    FacturasModule,
    VentasModule,
    DocumentosElectronicosModule,
    ComandasModule,
    CajasModule,
    ClientesModule,
    ReportesModule,
    DashboardModule,
    ConfiguracionModule,
    AutorizacionModule,
    AuditoriaModule,
    PlataformaModule,
    FiscalModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditoriaInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TrazabilidadInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: RespuestaSeguraInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: ExcepcionesFilter,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelacionMiddleware).forRoutes('*');
  }
}
