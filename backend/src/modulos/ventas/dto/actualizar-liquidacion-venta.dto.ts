import { IsInt, IsNumber, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ActualizarLiquidacionVentaDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  descuentos!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  propina!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  clienteId?: number | null;
}
