import { UnidadInventario } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsString,
  Min,
} from 'class-validator';

export class CreateArticuloDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsEnum(UnidadInventario)
  unidad: UnidadInventario;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  costoUnidad: number;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  stock: number;

  @IsInt()
  @IsNotEmpty()
  sucursalId: number;
}
