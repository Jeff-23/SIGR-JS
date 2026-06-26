import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsuariosModule } from './modulos/usuarios/usuarios.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [UsuariosModule, PrismaModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
