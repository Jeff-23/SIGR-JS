import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class ActualizarMesaDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(10)
  numero?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacidad?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  zonaId?: number;

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
