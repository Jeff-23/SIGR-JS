import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class ProcesarColaFiscalDto {
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  sucursalId?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limite?: number;
}
