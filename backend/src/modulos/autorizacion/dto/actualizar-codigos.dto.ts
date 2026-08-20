import { ArrayUnique, IsArray, IsString, Matches } from 'class-validator';

export class ActualizarCodigosDto {
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @Matches(/^[A-Z0-9_]{2,80}$/, { each: true })
  codigos!: string[];
}
