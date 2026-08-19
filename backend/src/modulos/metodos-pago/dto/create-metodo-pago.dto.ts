import { TipoMetodoPago } from '@prisma/client';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateMetodoPagoDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsEnum(TipoMetodoPago)
  @IsOptional()
  tipo?: TipoMetodoPago;
}
