import { UnidadInventario } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  Min,
} from 'class-validator';

export class CreateRecetaDto {
  @IsInt()
  @Min(1)
  productoId: number;

  @IsInt()
  @Min(1)
  articuloId: number;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  cantidad: number;

  /**
   * Unidad en la que está expresado el consumo de la receta.
   * Si se omite, se usa la unidad base del artículo.
   */
  @IsEnum(UnidadInventario)
  @IsOptional()
  unidad?: UnidadInventario;
}
