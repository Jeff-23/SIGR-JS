import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class ListarDocumentosElectronicosDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  sucursalId?: number;
}
