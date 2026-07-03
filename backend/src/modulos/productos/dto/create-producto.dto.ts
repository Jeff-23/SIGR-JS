import { IsString, IsNotEmpty, IsInt, IsOptional, IsNumber, Min } from 'class-validator';

export class CreateProductoDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsString()
  @IsOptional()
  descripcion?: string;

  @IsNumber()
  @Min(0)
  precio: number;

  @IsInt()
  @IsNotEmpty()
  categoriaId: number;
}