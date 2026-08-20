import { Type } from 'class-transformer';
import { TipoMovimientoInventario } from '@prisma/client';
import { IsDateString, IsEnum, IsInt, IsOptional, Min } from 'class-validator';

export class ListarMovimientosInventarioDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  sucursalId?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  productoId?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  articuloId?: number;

  @IsEnum(TipoMovimientoInventario)
  @IsOptional()
  tipo?: TipoMovimientoInventario;

  @IsDateString()
  @IsOptional()
  desde?: string;

  @IsDateString()
  @IsOptional()
  hasta?: string;
}
