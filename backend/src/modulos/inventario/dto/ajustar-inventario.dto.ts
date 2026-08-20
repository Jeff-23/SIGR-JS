import { TipoMovimientoInventario, UnidadInventario } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class AjustarInventarioDto {
  @IsInt()
  @Min(1)
  sucursalId: number;

  @ValidateIf((obj: AjustarInventarioDto) => obj.articuloId === undefined)
  @IsInt()
  @Min(1)
  productoId?: number;

  @ValidateIf((obj: AjustarInventarioDto) => obj.productoId === undefined)
  @IsInt()
  @Min(1)
  articuloId?: number;

  @IsEnum(TipoMovimientoInventario)
  tipo: TipoMovimientoInventario;

  @IsNumber({
    maxDecimalPlaces: 4,
  })
  @Min(0.0001)
  cantidad: number;

  @IsEnum(UnidadInventario)
  unidad: UnidadInventario;

  @IsString()
  @IsNotEmpty()
  @MaxLength(250)
  motivo: string;
}
