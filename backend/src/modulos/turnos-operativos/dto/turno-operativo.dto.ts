import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CrearTurnoOperativoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  nombre!: string;

  @IsInt()
  @Min(1)
  sucursalId!: number;

  @IsOptional()
  @IsBoolean()
  estado?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  orden?: number;
}

export class ActualizarTurnoOperativoDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  nombre?: string;

  @IsOptional()
  @IsBoolean()
  estado?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  orden?: number;
}
