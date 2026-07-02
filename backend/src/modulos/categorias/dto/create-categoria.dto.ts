import { IsString, IsNotEmpty, IsInt, MaxLength } from 'class-validator';

export class CreateCategoriaDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  nombre: string;

  @IsInt()
  @IsNotEmpty()
  sucursalId: number;
}
