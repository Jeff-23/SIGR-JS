import { Module } from '@nestjs/common';
import { ZonasService } from './zonas.service';
import { ZonasController } from './zonas.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ZonasController], // ¡Esta es la línea que expone la ruta!
  providers: [ZonasService],
})
export class ZonasModule {}