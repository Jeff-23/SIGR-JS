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
import { ProductosController } from './modulos/productos/productos.controller';
import { ProductosService } from './modulos/productos/productos.service';

@Module({
  imports: [
    // Escudo activado: Máximo 10 peticiones cada 60 segundos (60000 milisegundos) por IP
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 10,
    }]),
    PrismaModule, 
    UsuariosModule, 
    AuthModule, RestaurantesModule, SucursalesModule, CategoriasModule, MesasModule
  ],
  controllers: [AppController, ProductosController],
  providers: [
    AppService,
    // Esto hace que el escudo proteja TODO el sistema automáticamente
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    ProductosService
  ],
})
export class AppModule {}