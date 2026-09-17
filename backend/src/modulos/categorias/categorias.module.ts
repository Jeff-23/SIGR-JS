import { Module } from '@nestjs/common';
import { CategoriasService } from './categorias.service';
import { CategoriasController } from './categorias.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { SyncModule } from '../sync/sync.module';

@Module({
  imports: [PrismaModule, SyncModule],
  // ¡Esta línea es la clave para que NestJS detecte las rutas!
  controllers: [CategoriasController],
  providers: [CategoriasService],
})
export class CategoriasModule {}
