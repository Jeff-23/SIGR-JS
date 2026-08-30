import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AbastecimientoController } from './abastecimiento.controller';
import { AbastecimientoService } from './abastecimiento.service';
@Module({
  imports: [PrismaModule],
  controllers: [AbastecimientoController],
  providers: [AbastecimientoService],
})
export class AbastecimientoModule {}
