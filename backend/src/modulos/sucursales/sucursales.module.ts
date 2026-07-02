import { Module } from '@nestjs/common';
import { SucursalesService } from './sucursales.service';
import { SucursalesController } from './sucursales.controller';
import { PrismaModule } from '../../prisma/prisma.module'; // Ajusta la ruta si es necesario

@Module({
  imports: [PrismaModule],
  controllers: [SucursalesController],
  providers: [SucursalesService],
})
export class SucursalesModule {}