import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateSucursalDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nombre: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  direccion?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  municipio?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  departamento?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  telefono?: string;

  @IsString()
  @IsOptional()
  @MaxLength(30)
  whatsapp?: string;

  @IsEmail({}, { message: 'Debe ingresar un correo válido' })
  @IsOptional()
  @MaxLength(150)
  correo?: string;

  @IsInt()
  @IsNotEmpty()
  restauranteId: number;
}
