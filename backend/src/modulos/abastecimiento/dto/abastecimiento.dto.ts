import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CrearProveedorDto {
  @IsString() @MaxLength(140) nombre: string;
  @IsOptional() @IsString() @MaxLength(30) identificacion?: string;
  @IsOptional() @IsString() @MaxLength(120) contacto?: string;
  @IsOptional() @IsString() @MaxLength(30) telefono?: string;
  @IsOptional() @IsEmail() @MaxLength(150) correo?: string;
}

export class PrecioProveedorDto {
  @IsInt() @Min(1) articuloId: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) precio: number;
  @IsOptional() @IsString() @MaxLength(60) codigo?: string;
}

class LineaCompraDto {
  @IsInt() @Min(1) articuloId: number;
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0.0001) cantidad: number;
}

export class CrearSolicitudCompraDto {
  @IsInt() @Min(1) sucursalId: number;
  @IsOptional() @IsInt() @Min(1) proveedorId?: number;
  @IsOptional() @IsString() @MaxLength(300) observaciones?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LineaCompraDto)
  detalles: LineaCompraDto[];
}

export class ConvertirSolicitudDto {
  @IsOptional() @IsInt() @Min(1) proveedorId?: number;
}

class LineaRecepcionDto {
  @IsInt() @Min(1) detalleOrdenId: number;
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0.0001) cantidad: number;
}

export class RecibirOrdenDto {
  @IsOptional() @IsString() @MaxLength(80) documento?: string;
  @IsOptional() @IsString() @MaxLength(300) observaciones?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LineaRecepcionDto)
  detalles: LineaRecepcionDto[];
}
