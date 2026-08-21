import { Module } from '@nestjs/common';
import { RegistrosFacturaController } from './registros-factura.controller';
import { RegistrosFacturaService } from './registros-factura.service';

@Module({
  controllers: [RegistrosFacturaController],
  providers: [RegistrosFacturaService],
  exports: [RegistrosFacturaService],
})
export class RegistrosFacturaModule {}
