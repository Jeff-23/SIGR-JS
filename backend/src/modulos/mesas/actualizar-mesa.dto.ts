import { FormaMesa, OrientacionMesa } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class ActualizarMesaDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(10)
  numero?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacidad?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  zonaId?: number;

  @IsOptional()
  @IsEnum(FormaMesa)
  forma?: FormaMesa;

  @IsOptional()
  @IsEnum(OrientacionMesa)
  orientacion?: OrientacionMesa;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3)
  tamanoVisual?: number;
}
