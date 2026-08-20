import { EstadoDomicilio } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class ActualizarDomicilioDto {
  @IsEnum(EstadoDomicilio)
  estado: EstadoDomicilio;

  @IsOptional()
  @IsInt()
  @Min(1)
  repartidorId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  observacion?: string;
}
