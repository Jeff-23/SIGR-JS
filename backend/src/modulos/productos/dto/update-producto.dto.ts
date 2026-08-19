import {
  EstrategiaInventario,
  UnidadInventario,
} from '@prisma/client';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class UpdateProductoDto {
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

  @IsEnum(EstrategiaInventario)
  @IsOptional()
  estrategiaInventario?: EstrategiaInventario;

  @IsEnum(UnidadInventario)
  @IsOptional()
  unidadInventario?: UnidadInventario;
}
