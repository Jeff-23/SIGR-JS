import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class SeccionPerfilCartaDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoriaId!: number;

  @IsString()
  @MaxLength(80)
  titulo!: string;

  @IsArray()
  @ArrayMaxSize(150)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  productoIds!: number[];
}

export class PlantillaPerfilCartaDto {
  @IsString()
  @MaxLength(120)
  titulo!: string;

  @IsOptional()
  @IsString()
  @MaxLength(220)
  subtitulo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  pie?: string;

  @IsIn(['EDITORIAL_DORADO', 'CONTEMPORANEA', 'EJECUTIVA'])
  estilo!: 'EDITORIAL_DORADO' | 'CONTEMPORANEA' | 'EJECUTIVA';

  @IsBoolean()
  mostrarPrecios!: boolean;

  @IsBoolean()
  mostrarImagenesProductos!: boolean;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/)
  fondoColor?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/)
  tarjetaColor?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/)
  textoColor?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/)
  acentoColor?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/)
  encabezadoColor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  logoUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  fondoImagenUrl?: string | null;

  @IsNumber()
  @Min(0)
  @Max(0.75)
  fondoImagenOpacidad!: number;

  @IsNumber()
  @Min(0.25)
  @Max(1)
  tarjetaOpacidad!: number;

  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => SeccionPerfilCartaDto)
  secciones!: SeccionPerfilCartaDto[];
}

export class GuardarPerfilCartaDto {
  @IsString()
  @MaxLength(100)
  nombre!: string;

  @IsOptional()
  @IsString()
  @MaxLength(220)
  descripcion?: string;

  @IsBoolean()
  estado!: boolean;

  @IsBoolean()
  predeterminada!: boolean;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  orden!: number;

  @IsIn(['SIEMPRE', 'HORARIO', 'MANUAL'])
  modoActivacion!: 'SIEMPRE' | 'HORARIO' | 'MANUAL';

  @IsBoolean()
  activoManual!: boolean;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  horaInicio?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  horaFin?: string | null;

  @IsArray()
  @ArrayMaxSize(7)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  diasSemana!: number[];

  @ValidateNested()
  @Type(() => PlantillaPerfilCartaDto)
  plantilla!: PlantillaPerfilCartaDto;
}

export class GuardarIdentidadCartaDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  logoUrl?: string | null;
}
