import { Module } from '@nestjs/common';

import { PrismaModule } from '../../prisma/prisma.module';
import { InventarioModule } from '../inventario/inventario.module';

import { VentasController } from './ventas.controller';
import { VentasService } from './ventas.service';

@Module({
  imports: [
    PrismaModule,
    InventarioModule,
  ],

  controllers: [
    VentasController,
  ],

  providers: [
    VentasService,
  ],

  exports: [
    VentasService,
  ],
})
export class VentasModule {}
