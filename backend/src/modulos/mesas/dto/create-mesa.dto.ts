import { IsString, IsNotEmpty, IsInt, Min } from 'class-validator';

export class CreateMesaDto {
  @IsString()
  @IsNotEmpty()
  numero: string;

  @IsInt()
  @Min(1)
  capacidad: number;

  @IsInt()
  @IsNotEmpty()
  zonaId: number;
}
