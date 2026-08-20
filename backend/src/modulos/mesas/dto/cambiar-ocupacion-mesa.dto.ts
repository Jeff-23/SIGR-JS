import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CambiarOcupacionMesaDto {
  @IsOptional()
  @IsString()
  @MaxLength(250)
  motivo?: string;
}
