import { Module } from '@nestjs/common';
import { SucursalesService } from './sucursales.service';
import { SucursalesController } from './sucursales.controller';

@Module({
  providers: [SucursalesService],
  controllers: [SucursalesController]
})
export class SucursalesModule {}
