import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  Min,
} from 'class-validator';

export class ListarCajasDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  sucursalId?: number;

  @IsDateString()
  @IsOptional()
  desde?: string;

  @IsDateString()
  @IsOptional()
  hasta?: string;
}
