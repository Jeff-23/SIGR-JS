import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { InteligenciaController } from './inteligencia.controller';
import { InteligenciaService } from './inteligencia.service';
@Module({
  imports: [PrismaModule],
  controllers: [InteligenciaController],
  providers: [InteligenciaService],
})
export class InteligenciaModule {}
