import {
  IsInt,
  Min,
} from 'class-validator';

export class CreateFacturaVentaDto {
  @IsInt()
  @Min(1)
  ventaId: number;
}