import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, Max, Min } from 'class-validator';

export class ListarCajasDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  sucursalId?: number;

  @IsDateString()
  @IsOptional()
  desde?: string;

  @IsDateString()
  @IsOptional()
  hasta?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  pagina = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  @IsOptional()
  limite = 100;
}
