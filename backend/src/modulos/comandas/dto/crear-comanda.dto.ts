import {
  ArrayMinSize,
  IsArray,
  IsInt,
  Min,
  ValidateNested,
} from 'class-validator';

import { Type } from 'class-transformer';

export class DetalleNuevaComandaDto {
  @IsInt()
  detallePedidoId: number;

  @IsInt()
  @Min(1)
  cantidad: number;
}

export class CrearComandaDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DetalleNuevaComandaDto)
  detalles: DetalleNuevaComandaDto[];
}
