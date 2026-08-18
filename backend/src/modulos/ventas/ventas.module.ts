import { Module } from '@nestjs/common';

import { PrismaModule } from '../../prisma/prisma.module';

import { VentasController } from './ventas.controller';
import { VentasService } from './ventas.service';

@Module({
  imports: [
    PrismaModule,
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
