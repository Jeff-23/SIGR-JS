import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { OrigenRegistroFactura } from '@prisma/client';
import { PaginacionDto } from '../../../plataforma/paginacion';

export class ListarRegistrosFacturaDto extends PaginacionDto {
  @IsString()
  @IsOptional()
  buscar?: string;

  @IsDateString()
  @IsOptional()
  desde?: string;

  @IsDateString()
  @IsOptional()
  hasta?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  montoDesde?: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  montoHasta?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  sucursalId?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  digitadoPorId?: number;

  @IsEnum(OrigenRegistroFactura)
  @IsOptional()
  origen?: OrigenRegistroFactura;
}
