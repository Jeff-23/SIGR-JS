import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class GrupoCartaDiaDto {
  @IsString()
  @MaxLength(80)
  titulo!: string;

  @IsArray()
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  opciones!: string[];
}

export class EspecialCartaDiaDto {
  @IsString()
  @MaxLength(80)
  titulo!: string;

  @IsString()
  @MaxLength(120)
  nombre!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  descripcion?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  precio?: number;
}

export class ContenidoCartaDiaDto {
  @IsString()
  @MaxLength(120)
  titulo!: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  subtitulo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  precioBase?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GrupoCartaDiaDto)
  grupos!: GrupoCartaDiaDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => EspecialCartaDiaDto)
  especial?: EspecialCartaDiaDto;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  mensaje?: string;
}

export class GuardarCartaDiaDto {
  @ValidateNested()
  @Type(() => ContenidoCartaDiaDto)
  contenido!: ContenidoCartaDiaDto;

  @IsBoolean()
  publicada!: boolean;
}
