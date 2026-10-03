import { Module } from '@nestjs/common';

import { PrismaModule } from '../../prisma/prisma.module';
import { SyncModule } from '../sync/sync.module';
import { CierreDistribucionController } from './cierre-distribucion.controller';
import { CierreDistribucionService } from './cierre-distribucion.service';
import { SmtpCierreEmailProvider } from './proveedores/smtp-cierre-email.provider';
import { HttpWhatsAppCierreProvider } from './proveedores/http-whatsapp-cierre.provider';

@Module({
  imports: [PrismaModule, SyncModule],
  controllers: [CierreDistribucionController],
  providers: [
    CierreDistribucionService,
    SmtpCierreEmailProvider,
    HttpWhatsAppCierreProvider,
  ],
  exports: [CierreDistribucionService],
})
export class CierreDistribucionModule {}
