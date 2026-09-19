import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class SeccionPlantillaCartaDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoriaId!: number;

  @IsString()
  @MaxLength(80)
  titulo!: string;

  @IsArray()
  @ArrayMaxSize(100)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  productoIds!: number[];
}

export class GuardarPlantillaCartaDto {
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

  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => SeccionPlantillaCartaDto)
  secciones!: SeccionPlantillaCartaDto[];
}
