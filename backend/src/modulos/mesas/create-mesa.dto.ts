import { FormaMesa, OrientacionMesa } from '@prisma/client';
import { IsEnum, IsInt, IsNotEmpty, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateMesaDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  numero: string;

  @IsInt()
  @Min(1)
  capacidad: number;

  @IsInt()
  @IsNotEmpty()
  zonaId: number;

  @IsEnum(FormaMesa)
  forma: FormaMesa;

  @IsEnum(OrientacionMesa)
  orientacion: OrientacionMesa;

  @IsInt()
  @Min(1)
  @Max(3)
  tamanoVisual: number;
}
