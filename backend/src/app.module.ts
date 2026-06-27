import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { UsuariosModule } from './modulos/usuarios/usuarios.module';
import { AuthModule } from './modulos/auth/auth.module';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

@Module({
  imports: [
    // Escudo activado: Máximo 10 peticiones cada 60 segundos (60000 milisegundos) por IP
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 10,
    }]),
    PrismaModule, 
    UsuariosModule, 
    AuthModule
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Esto hace que el escudo proteja TODO el sistema automáticamente
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    }
  ],
})
export class AppModule {}