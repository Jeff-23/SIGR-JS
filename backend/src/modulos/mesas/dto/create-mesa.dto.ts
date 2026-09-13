import { IsString, IsNotEmpty, IsInt, Min, Max, MaxLength, IsIn, IsOptional } from 'class-validator';

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

  @IsOptional()
  @IsIn(['REDONDA', 'CUADRADA', 'RECTANGULAR'])
  forma?: 'REDONDA' | 'CUADRADA' | 'RECTANGULAR';

  @IsOptional()
  @IsIn(['HORIZONTAL', 'VERTICAL'])
  orientacion?: 'HORIZONTAL' | 'VERTICAL';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3)
  tamanoVisual?: number;
}
