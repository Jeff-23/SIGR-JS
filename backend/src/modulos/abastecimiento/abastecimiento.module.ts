import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { SyncModule } from '../sync/sync.module';
import { AbastecimientoController } from './abastecimiento.controller';
import { AbastecimientoService } from './abastecimiento.service';
@Module({
  imports: [PrismaModule, SyncModule],
  controllers: [AbastecimientoController],
  providers: [AbastecimientoService],
})
export class AbastecimientoModule {}
