import { IsString, IsNotEmpty, IsNumber, IsInt, Min } from 'class-validator';

export class CreateArticuloDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsString()
  @IsNotEmpty()
  unidad: string;

  @IsNumber()
  @Min(0)
  costoUnidad: number;

  @IsNumber()
  @Min(0)
  stock: number;

  @IsInt()
  @IsNotEmpty()
  sucursalId: number;
}