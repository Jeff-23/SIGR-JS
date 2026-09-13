import {
  IsBoolean,
  IsHexColor,
  IsInt,
  IsOptional,
  IsIn,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class CrearEstacionDto {
  @IsInt()
  @Min(1)
  sucursalId: number;

  @IsString()
  @Matches(/^[A-Z0-9_]{2,40}$/)
  codigo: string;

  @IsString()
  @MaxLength(80)
  nombre: string;

  @IsHexColor()
  color: string;

  @IsOptional()
  @IsInt()
  orden?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  objetivoPreparacionMin?: number;

  @IsOptional()
  @IsIn(['KDS', 'IMPRESION', 'KDS_E_IMPRESION'])
  modoOperacion?: 'KDS' | 'IMPRESION' | 'KDS_E_IMPRESION';
}

export class ActualizarEstacionDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  nombre?: string;

  @IsOptional()
  @IsHexColor()
  color?: string;

  @IsOptional()
  @IsInt()
  orden?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  objetivoPreparacionMin?: number;

  @IsOptional()
  @IsIn(['KDS', 'IMPRESION', 'KDS_E_IMPRESION'])
  modoOperacion?: 'KDS' | 'IMPRESION' | 'KDS_E_IMPRESION';

  @IsOptional()
  @IsBoolean()
  estado?: boolean;
}
