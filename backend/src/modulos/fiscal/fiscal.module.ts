import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { FiscalController } from './fiscal.controller';
import { FiscalService } from './fiscal.service';

@Module({
  imports: [PrismaModule],
  controllers: [FiscalController],
  providers: [FiscalService],
  exports: [FiscalService],
})
export class FiscalModule {}
