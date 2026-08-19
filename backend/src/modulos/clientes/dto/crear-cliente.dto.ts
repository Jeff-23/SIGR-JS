import {
  IsDateString,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CrearClienteDto {
  @IsString()
  @IsOptional()
  @MaxLength(20)
  tipoDocumento?: string | null;

  @IsString()
  @IsOptional()
  @MaxLength(30)
  numeroDocumento?: string | null;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nombres: string;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  apellidos?: string | null;

  @IsString()
  @IsOptional()
  @MaxLength(30)
  telefono?: string | null;

  @IsEmail()
  @IsOptional()
  @MaxLength(150)
  correo?: string | null;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  direccion?: string | null;

  @IsDateString()
  @IsOptional()
  fechaNacimiento?: string | null;
}
