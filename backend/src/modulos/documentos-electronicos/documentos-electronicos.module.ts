import { Module } from '@nestjs/common';

import { PrismaModule } from '../../prisma/prisma.module';

import { DocumentosElectronicosController } from './documentos-electronicos.controller';

import { DocumentosElectronicosService } from './documentos-electronicos.service';
import { UblFiscalService } from './ubl-fiscal.service';

@Module({
  imports: [PrismaModule],

  controllers: [DocumentosElectronicosController],

  providers: [DocumentosElectronicosService, UblFiscalService],

  exports: [DocumentosElectronicosService],
})
export class DocumentosElectronicosModule {}
