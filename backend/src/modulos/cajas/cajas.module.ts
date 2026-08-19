import { Module } from '@nestjs/common';

import { PrismaModule } from '../../prisma/prisma.module';
import { CajasController } from './cajas.controller';
import { CajasService } from './cajas.service';

@Module({
  imports: [PrismaModule],
  controllers: [CajasController],
  providers: [CajasService],
  exports: [CajasService],
})
export class CajasModule {}
