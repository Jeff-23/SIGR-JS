import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateRestauranteDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre comercial del restaurante es obligatorio' })
  @MaxLength(100)
  nombre: string;

  @IsString()
  @IsOptional()
  @MaxLength(150)
  razonSocial?: string;

  @IsString()
  @IsNotEmpty({ message: 'El NIT es obligatorio' })
  @MaxLength(20)
  nit: string;

  @IsOptional()
  @Matches(/^\d$/, { message: 'El DV debe ser un solo dígito' })
  dv?: string;

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
}
