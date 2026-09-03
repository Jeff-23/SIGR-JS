import { EstrategiaInventario, UnidadInventario } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateProductoDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsString()
  @IsOptional()
  descripcion?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  precio: number;

  @IsInt()
  @IsNotEmpty()
  categoriaId: number;

  @IsInt()
  @IsOptional()
  @Min(1)
  estacionId?: number;


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
