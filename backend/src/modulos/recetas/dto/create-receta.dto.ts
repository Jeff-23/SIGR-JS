import { IsNumber, IsInt, IsNotEmpty, Min } from 'class-validator';

export class CreateRecetaDto {
  @IsInt()
  @IsNotEmpty()
  productoId: number;

  @IsInt()
  @IsNotEmpty()
  articuloId: number;

  @IsNumber()
  @Min(0)
  cantidad: number;
}