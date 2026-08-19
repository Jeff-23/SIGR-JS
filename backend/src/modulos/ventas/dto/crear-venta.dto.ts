import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';

import { Type } from 'class-transformer';

export class AjustesVentaDto {
  @IsInt()
  @Min(1)
  @IsOptional()
  clienteId?: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  descuentos?: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  impuestos?: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  impoconsumo?: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  propina?: number;
}

export class DetalleVentaDto {
  @IsInt()
  @Min(1)
  productoId: number;

  @IsInt()
  @Min(1)
  cantidad: number;
}

export class CrearVentaPedidoDto extends AjustesVentaDto {
  @IsInt()
  @Min(1)
  pedidoId: number;
}

export class CrearVentaDirectaDto extends AjustesVentaDto {
  @IsInt()
  @Min(1)
  sucursalId: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DetalleVentaDto)
  detalles: DetalleVentaDto[];
}

export class CrearVentaManualDto extends CrearVentaDirectaDto {
  @IsISO8601()
  fechaOperacion: string;
}
