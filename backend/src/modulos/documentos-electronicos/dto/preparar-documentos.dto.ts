import { TipoDocumentoFiscal } from '@prisma/client';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  Min,
} from 'class-validator';

export class PrepararDocumentosDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  facturaIds: number[];

  @IsOptional()
  @IsIn(['FACTURA_VENTA', 'DOCUMENTO_EQUIVALENTE_POS'])
  tipo?: TipoDocumentoFiscal;
}
