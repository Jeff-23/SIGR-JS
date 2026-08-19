import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';

import { ArticulosModule } from './modulos/articulos/articulos.module';
import { AuthModule } from './modulos/auth/auth.module';
import { CajasModule } from './modulos/cajas/cajas.module';
import { CategoriasModule } from './modulos/categorias/categorias.module';
import { ComandasModule } from './modulos/comandas/comandas.module';
import { DocumentosElectronicosModule } from './modulos/documentos-electronicos/documentos-electronicos.module';
import { FacturasModule } from './modulos/facturas/facturas.module';
import { MesasModule } from './modulos/mesas/mesas.module';
import { MetodosPagoModule } from './modulos/metodos-pago/metodos-pago.module';
import { PedidosModule } from './modulos/pedidos/pedidos.module';
import { ProductosModule } from './modulos/productos/productos.module';
import { RecetasModule } from './modulos/recetas/recetas.module';
import { RestaurantesModule } from './modulos/restaurantes/restaurantes.module';
import { SucursalesModule } from './modulos/sucursales/sucursales.module';
import { UsuariosModule } from './modulos/usuarios/usuarios.module';
import { VentasModule } from './modulos/ventas/ventas.module';
import { ZonasModule } from './modulos/zonas/zonas.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 10,
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
    PedidosModule,
    ArticulosModule,
    RecetasModule,
    MetodosPagoModule,
    FacturasModule,
    VentasModule,
    DocumentosElectronicosModule,
    ComandasModule,
    CajasModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
