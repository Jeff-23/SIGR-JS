import { Module } from '@nestjs/common';

import { ComandasController } from './comandas.controller';
import { ComandasService } from './comandas.service';

@Module({
  controllers: [ComandasController],
  providers: [ComandasService],
})
export class ComandasModule {}