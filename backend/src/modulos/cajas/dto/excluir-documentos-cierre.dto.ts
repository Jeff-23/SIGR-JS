import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ExcluirDocumentosCierreDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  ventaIds: number[];

  @IsString()
  @MinLength(1)
  @MaxLength(250)
  motivo: string;

  @IsString()
  @MinLength(6)
  @MaxLength(128)
  password: string;
}
