import { Module } from '@nestjs/common';

import { PrismaModule } from '../../prisma/prisma.module';
import { InventarioModule } from '../inventario/inventario.module';
import { SyncModule } from '../sync/sync.module';

import { VentasController } from './ventas.controller';
import { VentasService } from './ventas.service';

@Module({
  imports: [PrismaModule, InventarioModule, SyncModule],

  controllers: [VentasController],

  providers: [VentasService],

  exports: [VentasService],
})
export class VentasModule {}
