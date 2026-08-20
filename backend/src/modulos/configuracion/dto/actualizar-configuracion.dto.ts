import { IsDefined } from 'class-validator';

export class ActualizarConfiguracionDto {
  @IsDefined()
  valor!: unknown;
}
