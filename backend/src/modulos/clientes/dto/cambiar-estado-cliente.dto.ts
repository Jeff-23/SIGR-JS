import { IsBoolean } from 'class-validator';

export class CambiarEstadoClienteDto {
  @IsBoolean()
  estado: boolean;
}
