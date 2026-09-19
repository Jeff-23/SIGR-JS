import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { CartaDiaController } from './carta-dia.controller';
import { CartaDiaService } from './carta-dia.service';

@Module({
  imports: [PrismaModule],
  controllers: [CartaDiaController],
  providers: [CartaDiaService],
})
export class CartaDiaModule {}
