import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import {
  MenuQrController,
  MenuQrPublicoController,
} from './menu-qr.controller';
import { MenuQrService } from './menu-qr.service';
import { MenuPublicacionService } from './menu-publicacion.service';

@Module({
  imports: [PrismaModule],
  controllers: [MenuQrPublicoController, MenuQrController],
  providers: [MenuQrService, MenuPublicacionService],
})
export class MenuQrModule {}
