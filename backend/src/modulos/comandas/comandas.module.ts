import { Module } from '@nestjs/common';

import { ComandasController } from './comandas.controller';
import { ComandasService } from './comandas.service';
import { SyncModule } from '../sync/sync.module';

@Module({
  imports: [SyncModule],
  controllers: [ComandasController],
  providers: [ComandasService],
})
export class ComandasModule {}
