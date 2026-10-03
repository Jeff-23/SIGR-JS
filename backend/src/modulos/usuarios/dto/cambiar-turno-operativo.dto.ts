import { IsInt, Min } from 'class-validator';

export class CambiarTurnoOperativoDto {
  @IsInt()
  @Min(1)
  turnoOperativoId!: number;
}
