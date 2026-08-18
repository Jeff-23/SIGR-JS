import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class RegistrarPagoDto {
  @IsInt()
  @Min(1)
  metodoPagoId: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  monto: number;

  @IsString()
  @MaxLength(150)
  @IsOptional()
  referencia?: string;
}
