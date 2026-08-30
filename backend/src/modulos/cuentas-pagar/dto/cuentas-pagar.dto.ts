import { Type } from 'class-transformer';
import {
  IsDate,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CrearFacturaProveedorDto {
  @IsInt() @Min(1) sucursalId: number;
  @IsInt() @Min(1) proveedorId: number;
  @IsOptional() @IsInt() @Min(1) ordenCompraId?: number;
  @IsString() @MaxLength(80) numero: string;
  @Type(() => Date) @IsDate() fechaEmision: Date;
  @Type(() => Date) @IsDate() fechaVencimiento: Date;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) total: number;
  @IsOptional() @IsString() @MaxLength(300) observaciones?: string;
}

export class RegistrarAbonoProveedorDto {
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) monto: number;
  @IsString() @MaxLength(40) metodo: string;
  @IsOptional() @IsString() @MaxLength(100) referencia?: string;
  @IsOptional() @IsString() @MaxLength(250) observaciones?: string;
}

export class FiltroCuentaProveedorDto {
  @Type(() => Number) @IsInt() @Min(1) sucursalId: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) proveedorId?: number;
}

export class FiltroContabilidadDto extends FiltroCuentaProveedorDto {
  @Type(() => Date) @IsDate() desde: Date;
  @Type(() => Date) @IsDate() hasta: Date;
}

export class CrearCierreAdministrativoDto {
  @IsInt() @Min(1) sucursalId: number;
  @Type(() => Date) @IsDate() fecha: Date;
  @IsOptional() @IsString() @MaxLength(300) observaciones?: string;
}
