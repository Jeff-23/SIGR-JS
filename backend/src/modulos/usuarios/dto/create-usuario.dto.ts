import {
  ArrayUnique,
  IsArray,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateUsuarioDto {
  @IsString()
  @IsNotEmpty()
  nombres: string;

  @IsString()
  @IsNotEmpty()
  apellidos: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @MinLength(10)
  password: string;

  @IsInt()
  @IsOptional()
  rolId?: number;

  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @IsOptional()
  rolIds?: number[];

  @IsInt()
  @IsOptional()
  restauranteId?: number | null;

  @IsInt()
  @IsOptional()
  sucursalId?: number | null;

  @IsInt()
  @IsOptional()
  perfilCartaId?: number | null;

  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @IsOptional()
  turnoOperativoIds?: number[];

  @IsInt()
  @IsOptional()
  turnoOperativoActivoId?: number | null;
}
