import { UnidadInventario } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateArticuloDto {
  @IsString()
  @IsOptional()
  nombre?: string;

  @IsEnum(UnidadInventario)
  @IsOptional()
  unidad?: UnidadInventario;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsOptional()
  @Min(0)
  costoUnidad?: number;
}
