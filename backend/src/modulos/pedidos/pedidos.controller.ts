import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import {
  PedidosService,
} from './pedidos.service';

import {
  CreatePedidoDto,
} from './dto/create-pedido.dto';

import {
  AgregarDetallesPedidoDto,
} from './dto/agregar-detalles-pedido.dto';

import {
  JwtAuthGuard,
} from '../auth/jwt-auth.guard';

import {
  PermissionsGuard,
} from '../auth/permissions.guard';

import {
  Permisos,
} from '../auth/permisos.decorator';

import {
  UsuarioAutenticado,
} from '../auth/types/usuario-autenticado.type';

type RequestAutenticada = {
  user: UsuarioAutenticado;
};

@Controller('pedidos')
@UseGuards(
  JwtAuthGuard,
  PermissionsGuard,
)
export class PedidosController {
  constructor(
    private readonly pedidosService:
      PedidosService,
  ) {}

  @Post()
  @Permisos('PEDIDOS_CREAR')
  create(
    @Body()
    createPedidoDto:
      CreatePedidoDto,

    @Req()
    request:
      RequestAutenticada,
  ) {
    return this.pedidosService.create(
      createPedidoDto,
      request.user,
    );
  }

  /*
   * Agregar nuevas lineas a un pedido existente.
   *
   * Ejemplo:
   *
   * Pedido inicial:
   * Hamburguesa x1
   *
   * Mas tarde:
   * Hamburguesa x2
   *
   * Se crea un nuevo DetallePedido para conservar
   * la trazabilidad de las comandas anteriores.
   */
  @Post(':id/detalles')
  @Permisos('PEDIDOS_EDITAR')
  agregarDetalles(
    @Param(
      'id',
      ParseIntPipe,
    )
    id: number,

    @Body()
    data:
      AgregarDetallesPedidoDto,

    @Req()
    request:
      RequestAutenticada,
  ) {
    return this.pedidosService.agregarDetalles(
      id,
      data,
      request.user,
    );
  }

  @Get()
  @Permisos('PEDIDOS_VER')
  findAll(
    @Req()
    request:
      RequestAutenticada,
  ) {
    return this.pedidosService.findAll(
      request.user,
    );
  }

  @Get(':id')
  @Permisos('PEDIDOS_VER')
  findOne(
    @Param(
      'id',
      ParseIntPipe,
    )
    id: number,

    @Req()
    request:
      RequestAutenticada,
  ) {
    return this.pedidosService.findOne(
      id,
      request.user,
    );
  }
}