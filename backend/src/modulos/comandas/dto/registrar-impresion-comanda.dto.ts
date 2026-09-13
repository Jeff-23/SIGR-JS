import { IsBoolean, IsOptional } from 'class-validator';

export class RegistrarImpresionComandaDto {
  @IsOptional()
  @IsBoolean()
  reimpresion?: boolean;
}
