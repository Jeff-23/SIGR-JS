import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { OrigenRegistroFactura } from '@prisma/client';

class DetalleRegistroFacturaDto {
  @IsString()
  @MaxLength(160)
  nombre!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  cantidad!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  precioUnitario!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  total!: number;
}

export class CrearRegistroFacturaDto {
  @IsString()
  @MaxLength(80)
  numero!: string;

  @IsString()
  @MaxLength(80)
  @IsOptional()
  numeroComanda?: string;

  @IsString()
  @MaxLength(80)
  @IsOptional()
  numeroSoporte?: string;

  @IsEnum(OrigenRegistroFactura)
  origen!: OrigenRegistroFactura;

  @IsDateString()
  fechaOperacion!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  sucursalId!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  ventaId?: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  subtotal!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  descuentos = 0;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  impuestos = 0;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  propina = 0;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  domicilio = 0;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  total!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DetalleRegistroFacturaDto)
  detalles!: DetalleRegistroFacturaDto[];

  @IsArray()
  @IsOptional()
  impuestosDetalle?: Record<string, unknown>[];

  @IsArray()
  @IsOptional()
  formasPago?: Record<string, unknown>[];

  @IsString()
  @MaxLength(500)
  @IsOptional()
  soporteArchivoRef?: string;

  @IsString()
  @MaxLength(500)
  @IsOptional()
  observaciones?: string;
}
