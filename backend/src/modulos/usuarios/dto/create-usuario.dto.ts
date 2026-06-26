import { IsString, IsEmail, IsNotEmpty, MinLength, IsInt, IsOptional } from 'class-validator';

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
  @MinLength(6)
  password: string;

  @IsInt()
  @IsNotEmpty()
  rolId: number;

  @IsInt()
  @IsOptional()
  sucursalId?: number;
}