import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';

import { Type } from 'class-transformer';

import { DetallePedidoDto } from './create-pedido.dto';

export class AgregarDetallesPedidoDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({
    each: true,
  })
  @Type(() => DetallePedidoDto)
  detalles: DetallePedidoDto[];
}
