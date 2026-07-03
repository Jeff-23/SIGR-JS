import { IsInt, IsNotEmpty, IsArray, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';

class DetallePedidoDto {
  @IsInt()
  @IsNotEmpty()
  productoId: number;

  @IsInt()
  @Min(1)
  cantidad: number;
}

export class CreatePedidoDto {
  @IsInt()
  @IsNotEmpty()
  mesaId: number;

  @IsInt()
  @IsNotEmpty()
  usuarioId: number; // El ID del mesero/admin que toma el pedido

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DetallePedidoDto)
  detalles: DetallePedidoDto[];
}