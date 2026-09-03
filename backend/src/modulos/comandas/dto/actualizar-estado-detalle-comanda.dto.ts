import { EstadoDetalleComanda } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class ActualizarEstadoDetalleComandaDto {
  @IsEnum(EstadoDetalleComanda)
  estado: EstadoDetalleComanda;
}
