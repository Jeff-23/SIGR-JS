import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { CartaDiaController } from './carta-dia.controller';
import { CartaMediaController } from './carta-media.controller';
import { CartaDiaService } from './carta-dia.service';

@Module({
  imports: [PrismaModule],
  controllers: [CartaDiaController, CartaMediaController],
  providers: [CartaDiaService],
})
export class CartaDiaModule {}
