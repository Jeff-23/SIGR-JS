import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class ProcesarColaFiscalDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limite?: number;
}
