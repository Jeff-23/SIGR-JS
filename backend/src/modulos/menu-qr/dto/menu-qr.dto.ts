import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

class LineaSolicitudQrDto {
  @IsInt() @Min(1) productoId: number;
  @IsInt() @Min(1) cantidad: number;
  @IsOptional() @IsString() @MaxLength(300) observaciones?: string;
}

export class CrearSolicitudQrDto {
  @IsString() @MaxLength(100) claveCliente: string;
  @IsOptional() @IsString() @MaxLength(120) nombreCliente?: string;
  @IsOptional() @IsString() @MaxLength(300) observaciones?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LineaSolicitudQrDto)
  detalles: LineaSolicitudQrDto[];
}

export class RechazarSolicitudQrDto {
  @IsString() @MaxLength(300) motivo: string;
}
