import { PrioridadComanda } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class ActualizarPrioridadComandaDto {
  @IsEnum(PrioridadComanda)
  prioridad: PrioridadComanda;
}
