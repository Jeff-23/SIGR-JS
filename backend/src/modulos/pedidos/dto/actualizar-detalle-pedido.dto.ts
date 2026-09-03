import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class ActualizarDetallePedidoDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  cantidad?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  observaciones?: string;
}
