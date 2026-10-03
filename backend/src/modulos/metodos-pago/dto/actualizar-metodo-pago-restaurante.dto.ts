import { IsBoolean } from 'class-validator';

export class ActualizarMetodoPagoRestauranteDto {
  @IsBoolean()
  activo: boolean;
}
