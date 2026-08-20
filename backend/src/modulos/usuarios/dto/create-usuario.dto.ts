import {
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
  rolId: number;

  @IsInt()
  @IsOptional()
  restauranteId?: number | null;

  @IsInt()
  @IsOptional()
  sucursalId?: number | null;
}
