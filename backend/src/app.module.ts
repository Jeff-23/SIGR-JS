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
import { ZonasModule } from './modulos/zonas/zonas.module'; // <-- Añadido correctamente
import { ProductosModule } from './modulos/productos/productos.module'; // <-- Añadido correctamente
import { PedidosModule } from './modulos/pedidos/pedidos.module';

@Module({
  imports: [
    // Escudo activado: Máximo 10 peticiones cada 60 segundos (60000 milisegundos) por IP
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
    ZonasModule,      // <-- Inyectado como módulo
    ProductosModule, PedidosModule   // <-- Inyectado como módulo
  ],
  controllers: [AppController], // <-- Limpio, sin controladores huérfanos
  providers: [
    AppService,
    // Esto hace que el escudo proteja TODO el sistema automáticamente
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    }
    // <-- Limpio, sin servicios huérfanos
  ],
})
export class AppModule {}