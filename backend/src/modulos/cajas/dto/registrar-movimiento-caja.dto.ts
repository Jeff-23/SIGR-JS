import { TipoMovimientoCaja } from '@prisma/client';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class RegistrarMovimientoCajaDto {
  @IsEnum(TipoMovimientoCaja)
  tipo: TipoMovimientoCaja;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  monto: number;

  @IsString()
  @MaxLength(120)
  concepto: string;

  @IsString()
  @MaxLength(250)
  @IsOptional()
  observacion?: string;
}
