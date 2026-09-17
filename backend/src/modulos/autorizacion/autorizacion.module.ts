import { Module } from '@nestjs/common';

import { AutorizacionController } from './autorizacion.controller';
import { AutorizacionService } from './autorizacion.service';
import { SyncModule } from '../sync/sync.module';

@Module({
  imports: [SyncModule],
  controllers: [AutorizacionController],
  providers: [AutorizacionService],
})
export class AutorizacionModule {}
