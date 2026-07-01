import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateRestauranteDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre del restaurante es obligatorio' })
  nombre: string;

  @IsString()
  @IsNotEmpty({ message: 'El NIT es obligatorio' })
  nit: string;

  @IsString()
  @IsOptional()
  direccion?: string;

  @IsString()
  @IsOptional()
  telefono?: string;

  @IsEmail({}, { message: 'Debe ingresar un correo válido' })
  @IsOptional()
  correo?: string;
}