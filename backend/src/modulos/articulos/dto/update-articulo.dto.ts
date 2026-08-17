import {
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class UpdateArticuloDto {
  @IsString()
  @IsOptional()
  nombre?: string;

  @IsString()
  @IsOptional()
  unidad?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  costoUnidad?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  stock?: number;
}