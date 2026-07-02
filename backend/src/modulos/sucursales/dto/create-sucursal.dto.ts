import { IsString, IsNotEmpty, IsInt, IsOptional, MaxLength } from 'class-validator';

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
  @MaxLength(20)
  telefono?: string;

  @IsInt()
  @IsNotEmpty()
  restauranteId: number;
}