import { Module } from '@nestjs/common';
import { RegistrosFacturaController } from './registros-factura.controller';
import { RegistrosFacturaService } from './registros-factura.service';
import { SoportesRegistroService } from './soportes-registro.service';

@Module({
  controllers: [RegistrosFacturaController],
  providers: [RegistrosFacturaService, SoportesRegistroService],
  exports: [RegistrosFacturaService],
})
export class RegistrosFacturaModule {}
