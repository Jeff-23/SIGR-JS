import { Type } from 'class-transformer';
import { IsDate, IsInt, IsNumber, Max, Min } from 'class-validator';

export class FiltroRentabilidadDto {
  @Type(() => Number) @IsInt() @Min(1) sucursalId: number;
  @Type(() => Date) @IsDate() desde: Date;
  @Type(() => Date) @IsDate() hasta: Date;
}

export class RendimientoProductoDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(100)
  rendimientoPorcentaje: number;
}
