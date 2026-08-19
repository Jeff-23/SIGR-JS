import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';

import { Type } from 'class-transformer';

import {
  TipoPedido,
} from '@prisma/client';

export class DetallePedidoDto {
  @IsInt()
  @Min(1)
  productoId: number;

  @IsInt()
  @Min(1)
  cantidad: number;
}

export class CreatePedidoDto {
  @IsEnum(TipoPedido)
  tipo: TipoPedido;

  /*
   * Obligatorio únicamente para pedidos MESA.
   *
   * Para MOSTRADOR / PARA_LLEVAR / DOMICILIO
   * debe omitirse.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  mesaId?: number;

  /*
   * Permite identificar la sucursal cuando
   * el usuario no está ligado a una sucursal
   * concreta, por ejemplo un ADMIN del
   * restaurante.
   *
   * Para pedidos MESA la sucursal se deriva
   * directamente de la mesa.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  sucursalId?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({
    each: true,
  })
  @Type(
    () => DetallePedidoDto,
  )
  detalles: DetallePedidoDto[];
}