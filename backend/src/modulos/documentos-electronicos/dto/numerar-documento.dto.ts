import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class NumerarDocumentoDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  resolucionId: number;
}
