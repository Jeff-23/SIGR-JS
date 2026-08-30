import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import {
  MenuQrController,
  MenuQrPublicoController,
} from './menu-qr.controller';
import { MenuQrService } from './menu-qr.service';

@Module({
  imports: [PrismaModule],
  controllers: [MenuQrPublicoController, MenuQrController],
  providers: [MenuQrService],
})
export class MenuQrModule {}
