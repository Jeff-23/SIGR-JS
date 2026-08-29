import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class ParteCuentaDto {
  @IsString() @MaxLength(80) nombre: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) total: number;
  @IsOptional() detalles?: unknown;
}

export class DividirCuentaDto {
  @IsIn(['PERSONAS', 'PORCENTAJE', 'PRODUCTOS']) modo: string;
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ParteCuentaDto)
  partes: ParteCuentaDto[];
}
