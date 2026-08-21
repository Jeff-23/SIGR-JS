import { PartialType } from '@nestjs/mapped-types';
import { CrearRegistroFacturaDto } from './crear-registro-factura.dto';

export class ActualizarRegistroFacturaDto extends PartialType(
  CrearRegistroFacturaDto,
) {}
