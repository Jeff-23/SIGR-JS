import { Module } from '@nestjs/common';

import { PrismaModule } from '../../prisma/prisma.module';

import { DocumentosElectronicosController } from './documentos-electronicos.controller';

import { DocumentosElectronicosService } from './documentos-electronicos.service';

@Module({
  imports: [
    PrismaModule,
  ],

  controllers: [
    DocumentosElectronicosController,
  ],

  providers: [
    DocumentosElectronicosService,
  ],

  exports: [
    DocumentosElectronicosService,
  ],
})
export class DocumentosElectronicosModule {}