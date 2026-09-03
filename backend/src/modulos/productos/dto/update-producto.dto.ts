import { EstrategiaInventario, UnidadInventario } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class UpdateProductoDto {
  @IsInt()
  @IsOptional()
  @Min(1)
  estacionId?: number;
  @IsString()
  @IsOptional()
  nombre?: string;

  @IsString()
  @IsOptional()
  descripcion?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsOptional()
  @Min(0)
  precio?: number;


  @IsBoolean()
  @IsOptional()
  favorito?: boolean;

  @IsBoolean()
  @IsOptional()
  disponible?: boolean;

  @IsEnum(EstrategiaInventario)
  @IsOptional()
  estrategiaInventario?: EstrategiaInventario;

  @IsEnum(UnidadInventario)
  @IsOptional()
  unidadInventario?: UnidadInventario;
}
