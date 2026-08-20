import { Global, Module } from '@nestjs/common';

import { AuditoriaController } from './auditoria.controller';
import { AuditoriaService } from './auditoria.service';
import { AuditoriaInterceptor } from './auditoria.interceptor';

@Global()
@Module({
  controllers: [AuditoriaController],
  providers: [AuditoriaService, AuditoriaInterceptor],
  exports: [AuditoriaService, AuditoriaInterceptor],
})
export class AuditoriaModule {}
