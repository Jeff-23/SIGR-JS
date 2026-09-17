import { Module } from '@nestjs/common';
import { SyncModule } from '../sync/sync.module';
import { FidelizacionController } from './fidelizacion.controller';
import { FidelizacionService } from './fidelizacion.service';

@Module({
  imports: [SyncModule],
  controllers: [FidelizacionController],
  providers: [FidelizacionService],
  exports: [FidelizacionService],
})
export class FidelizacionModule {}
