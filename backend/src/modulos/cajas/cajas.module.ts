import { Module } from '@nestjs/common';

import { PrismaModule } from '../../prisma/prisma.module';
import { SyncModule } from '../sync/sync.module';
import { CajasController } from './cajas.controller';
import { CajasService } from './cajas.service';

@Module({
  imports: [PrismaModule, SyncModule],
  controllers: [CajasController],
  providers: [CajasService],
  exports: [CajasService],
})
export class CajasModule {}
