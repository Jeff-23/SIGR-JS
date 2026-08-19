import {
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CerrarCajaDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  saldoContado: number;

  @IsString()
  @MaxLength(250)
  @IsOptional()
  observacion?: string;
}
