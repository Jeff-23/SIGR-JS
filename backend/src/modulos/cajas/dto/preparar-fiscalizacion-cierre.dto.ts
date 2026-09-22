import { ArrayMinSize, IsArray, IsInt } from 'class-validator';

export class PrepararFiscalizacionCierreDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  facturaIds: number[];
}
