import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  Min,
} from 'class-validator';

export class ListarExistenciasInventarioDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  sucursalId?: number;
}
