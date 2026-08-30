import { IsNumber, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class DevolverPagoDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  monto: number;

  @IsString()
  @MinLength(3)
  @MaxLength(250)
  motivo: string;
}

export class ReversarVentaDto {
  @IsString()
  @MinLength(3)
  @MaxLength(250)
  motivo: string;
}
