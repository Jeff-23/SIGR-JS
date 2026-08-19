import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class AbrirCajaDto {
  @IsInt()
  @Min(1)
  sucursalId: number;

  @IsString()
  @MaxLength(80)
  nombre: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  saldoInicial: number;

  @IsString()
  @MaxLength(250)
  @IsOptional()
  observacion?: string;
}
