import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class ActualizarContextoPedidoDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  personas?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observaciones?: string;
}
