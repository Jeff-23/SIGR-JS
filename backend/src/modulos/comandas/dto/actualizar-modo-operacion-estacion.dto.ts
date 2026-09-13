import { IsIn } from 'class-validator';

export class ActualizarModoOperacionEstacionDto {
  @IsIn(['KDS', 'IMPRESION', 'KDS_E_IMPRESION'])
  modoOperacion: 'KDS' | 'IMPRESION' | 'KDS_E_IMPRESION';
}
