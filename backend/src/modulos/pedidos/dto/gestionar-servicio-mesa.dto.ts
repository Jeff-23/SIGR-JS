import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  Min,
} from 'class-validator';

export class TrasladarMesaDto {
  @Type(() => Number) @IsInt() @Min(1) mesaDestinoId: number;
}

export class UnirMesasDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  mesaIds: number[];
}

export class SepararMesaDto {
  @Type(() => Number) @IsInt() @Min(1) mesaId: number;
}

export class CambiarMeseroDto {
  @Type(() => Number) @IsInt() @Min(1) meseroId: number;
}
