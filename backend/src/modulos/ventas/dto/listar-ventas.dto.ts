import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { EstadoVenta, OrigenVenta } from '@prisma/client';

export class ListarVentasDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  sucursalId?: number;

  @IsEnum(EstadoVenta)
  @IsOptional()
  estado?: EstadoVenta;

  @IsEnum(OrigenVenta)
  @IsOptional()
  origen?: OrigenVenta;

  @IsDateString()
  @IsOptional()
  desde?: string;

  @IsDateString()
  @IsOptional()
  hasta?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  pagina = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  @IsOptional()
  limite = 200;
}
