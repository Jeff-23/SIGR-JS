import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { CostosController } from './costos.controller';
import { CostosService } from './costos.service';
@Module({
  imports: [PrismaModule],
  controllers: [CostosController],
  providers: [CostosService],
})
export class CostosModule {}
