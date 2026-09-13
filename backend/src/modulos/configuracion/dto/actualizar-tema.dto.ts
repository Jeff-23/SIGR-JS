import { IsHexColor, IsIn, IsOptional } from 'class-validator';

export class ActualizarTemaDto {
  @IsOptional()
  @IsHexColor()
  colorPrimario?: string;

  @IsOptional()
  @IsHexColor()
  colorSecundario?: string;

  @IsOptional()
  @IsHexColor()
  colorAcento?: string;

  @IsOptional()
  @IsHexColor()
  colorFondo?: string;

  @IsOptional()
  @IsIn(['MANROPE', 'SYSTEM', 'ARIAL', 'VERDANA', 'TREBUCHET', 'GEORGIA'])
  tipografia?: 'MANROPE' | 'SYSTEM' | 'ARIAL' | 'VERDANA' | 'TREBUCHET' | 'GEORGIA';
}
