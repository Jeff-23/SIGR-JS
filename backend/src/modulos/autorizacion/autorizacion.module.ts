import { Module } from '@nestjs/common';

import { AutorizacionController } from './autorizacion.controller';
import { AutorizacionService } from './autorizacion.service';

@Module({
  controllers: [AutorizacionController],
  providers: [AutorizacionService],
})
export class AutorizacionModule {}
