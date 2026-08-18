import { IsEnum } from 'class-validator';
import { EstadoComanda } from '@prisma/client';

export class ActualizarEstadoComandaDto {
  @IsEnum(EstadoComanda)
  estado: EstadoComanda;
}