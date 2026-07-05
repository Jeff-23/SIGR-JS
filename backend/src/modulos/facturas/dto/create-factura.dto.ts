import { IsInt, IsNotEmpty, IsArray, ValidateNested, IsString, IsOptional, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

class PagoDto {
  @IsInt()
  @IsNotEmpty()
  metodoPagoId: number;

  @IsNumber()
  @Min(1)
  monto: number;
}

export class CreateFacturaDto {
  @IsInt()
  @IsNotEmpty()
  pedidoId: number;

  @IsString()
  @IsOptional()
  resolucionDian?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PagoDto)
  pagos: PagoDto[];
}