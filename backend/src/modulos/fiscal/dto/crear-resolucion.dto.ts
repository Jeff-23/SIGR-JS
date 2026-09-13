import { Type } from 'class-transformer';
import {
  IsIn,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export type TipoNumeracionDianDto =
  | 'FACTURA_ELECTRONICA_VENTA'
  | 'DOCUMENTO_EQUIVALENTE_ELECTRONICO_POS';

export class CrearResolucionDto {
  @IsIn(['FACTURA_ELECTRONICA_VENTA', 'DOCUMENTO_EQUIVALENTE_ELECTRONICO_POS'])
  tipoNumeracion: TipoNumeracionDianDto;

  @IsString()
  @MaxLength(100)
  numeroResolucion: string;

  @Matches(/^[A-Z0-9]{0,4}$/)
  prefijo: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  rangoDesde: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  rangoHasta: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  siguienteNumero?: number;

  @Matches(/^secret:\/\/[a-zA-Z0-9/_-]+$/)
  @IsOptional()
  claveTecnicaRef?: string;

  @IsISO8601()
  @IsOptional()
  fechaAutorizacion?: string;

  @IsISO8601()
  vigenteDesde: string;

  @IsISO8601()
  vigenteHasta: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  sucursalId?: number;
}
