import { Type } from 'class-transformer';
import { IndicadorMetaOperativa } from '@prisma/client';
import {
  IsDate,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
export class FiltroInteligenciaDto {
  @Type(() => Number) @IsInt() @Min(1) sucursalId: number;
  @IsOptional() @Type(() => Date) @IsDate() desde?: Date;
  @IsOptional() @Type(() => Date) @IsDate() hasta?: Date;
}
export class ConfigurarMinimoDto {
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) stockMinimo: number;
  @IsInt() @Min(1) diasAnticipacion: number;
}
export class CrearMetaDto {
  @IsInt() @Min(1) sucursalId: number;
  @IsEnum(IndicadorMetaOperativa) indicador: IndicadorMetaOperativa;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) objetivo: number;
  @Type(() => Date) @IsDate() desde: Date;
  @Type(() => Date) @IsDate() hasta: Date;
  @IsOptional() @IsString() @MaxLength(200) descripcion?: string;
}
