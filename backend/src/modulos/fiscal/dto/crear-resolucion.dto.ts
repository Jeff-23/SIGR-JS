import { Type } from 'class-transformer';
import {
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class CrearResolucionDto {
  @IsString()
  @MaxLength(100)
  numeroResolucion: string;

  @Matches(/^[A-Z0-9-]{0,20}$/)
  prefijo: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  rangoDesde: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  rangoHasta: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  siguienteNumero?: number;

  @Matches(/^secret:\/\/[a-zA-Z0-9/_-]+$/)
  @IsOptional()
  claveTecnicaRef?: string;

  @IsISO8601()
  vigenteDesde: string;

  @IsISO8601()
  vigenteHasta: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  sucursalId?: number;
}
