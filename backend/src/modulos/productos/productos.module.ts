import { Module } from '@nestjs/common';
import { ProductosService } from './productos.service';
import { ProductosController } from './productos.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { ImagenesProductoService } from './imagenes-producto.service';
import { MediaProductoController } from './media-producto.controller';
import { SyncModule } from '../sync/sync.module';

@Module({
  imports: [PrismaModule, SyncModule],
  controllers: [ProductosController, MediaProductoController],
  providers: [ProductosService, ImagenesProductoService],
})
export class ProductosModule {}
