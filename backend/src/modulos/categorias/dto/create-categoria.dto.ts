import {
  ArrayUnique,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateCategoriaDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  nombre: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  descripcion?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  perfilCartaIds?: number[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  turnoOperativoIds?: number[];

  @IsInt()
  @IsNotEmpty()
  sucursalId: number;
}

export class UpdateCategoriaDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  descripcion?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  perfilCartaIds?: number[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  turnoOperativoIds?: number[];
}
