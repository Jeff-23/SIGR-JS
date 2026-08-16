import {
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateSucursalDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  nombre?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  direccion?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  telefono?: string;
}