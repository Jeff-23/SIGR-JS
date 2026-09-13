import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class ListarFacturasDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sucursalId?: number;
}
