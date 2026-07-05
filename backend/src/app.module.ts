import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { UsuariosModule } from './modulos/usuarios/usuarios.module';
import { AuthModule } from './modulos/auth/auth.module';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { RestaurantesModule } from './modulos/restaurantes/restaurantes.module';
import { SucursalesModule } from './modulos/sucursales/sucursales.module';
import { CategoriasModule } from './modulos/categorias/categorias.module';
import { MesasModule } from './modulos/mesas/mesas.module';
import { ZonasModule } from './modulos/zonas/zonas.module'; 
import { ProductosModule } from './modulos/productos/productos.module'; 
import { PedidosModule } from './modulos/pedidos/pedidos.module';
import { ArticulosModule } from './modulos/articulos/articulos.module'; 
import { RecetasModule } from './modulos/recetas/recetas.module'; 
import { MetodosPagoModule } from './modulos/metodos-pago/metodos-pago.module'; // <-- NUEVO
import { FacturasModule } from './modulos/facturas/facturas.module'; // <-- NUEVO

@Module({
  imports: [
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 10,
    }]),
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
    MetodosPagoModule, // <-- INYECTADO
    FacturasModule     // <-- INYECTADO
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    }
  ],
})
export class AppModule {}