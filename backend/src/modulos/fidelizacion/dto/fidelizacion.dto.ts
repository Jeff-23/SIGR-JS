import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { CanalComunicacion, TipoBeneficioPromocion } from '@prisma/client';

export class CrearPromocionDto {
  @IsString() @MinLength(3) @MaxLength(120) nombre: string;
  @IsOptional() @IsString() @MaxLength(500) descripcion?: string;
  @IsEnum(TipoBeneficioPromocion) tipo: TipoBeneficioPromocion;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) valor: number;
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  compraMinima?: number;
  @IsDateString() fechaInicio: string;
  @IsDateString() fechaFin: string;
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  diasSemana: number[];
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) horaInicio?: string;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) horaFin?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) sucursalId?: number;
  @IsArray()
  @ArrayMaxSize(500)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @IsOptional()
  productoIds?: number[];
  @IsBoolean() @IsOptional() combinable?: boolean;
  @IsBoolean() @IsOptional() requiereCupon?: boolean;
}

export class CrearCuponDto {
  @IsString() @MinLength(3) @MaxLength(50) codigo: string;
  @Type(() => Number) @IsInt() @Min(1) promocionId: number;
  @Type(() => Number) @IsInt() @Min(1) @IsOptional() clienteId?: number;
  @Type(() => Number) @IsInt() @Min(1) @IsOptional() usosMaximos?: number;
  @IsDateString() @IsOptional() validoDesde?: string;
  @IsDateString() @IsOptional() validoHasta?: string;
}

export class CrearNivelDto {
  @IsString() @MinLength(2) @MaxLength(80) nombre: string;
  @Type(() => Number) @IsInt() @Min(0) puntosMinimos: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.1) @Max(20) multiplicador: number;
  @IsOptional() beneficios?: unknown;
}

export class ConsentimientoDto {
  @IsBoolean() otorgado: boolean;
  @IsString() @MinLength(2) @MaxLength(80) fuente: string;
}

export class AjustarPuntosDto {
  @Type(() => Number) @IsInt() puntos: number;
  @IsString() @MinLength(3) @MaxLength(250) motivo: string;
}

export { CanalComunicacion };
