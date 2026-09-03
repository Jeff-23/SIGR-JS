import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';

export class ModificadorProductoDto {
  @IsString()
  @MaxLength(100)
  nombre: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  precio: number;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  orden?: number;
}

export class GestionarModificadoresDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ModificadorProductoDto)
  modificadores: ModificadorProductoDto[];
}
