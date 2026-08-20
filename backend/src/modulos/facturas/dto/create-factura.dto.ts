import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

import { Type } from 'class-transformer';

class PagoDto {
  @IsInt()
  @IsNotEmpty()
  metodoPagoId: number;

  @IsNumber()
  @Min(1)
  monto: number;
}

export class CreateFacturaDto {
  @IsInt()
  @IsNotEmpty()
  pedidoId: number;

  @IsString()
  @IsOptional()
  resolucionDian?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PagoDto)
  pagos: PagoDto[];
}
