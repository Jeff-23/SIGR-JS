import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { PedidosService } from './pedidos.service';

import { CreatePedidoDto } from './dto/create-pedido.dto';

import { AgregarDetallesPedidoDto } from './dto/agregar-detalles-pedido.dto';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';

import { PermissionsGuard } from '../auth/permissions.guard';

import { Permisos } from '../auth/permisos.decorator';

import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';
import { ActualizarDomicilioDto } from './dto/actualizar-domicilio.dto';

type RequestAutenticada = {
  user: UsuarioAutenticado;
};

@Controller('pedidos')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PedidosController {
  constructor(private readonly pedidosService: PedidosService) {}

  @Post()
  @Permisos('PEDIDOS_CREAR')
  create(
    @Body()
    createPedidoDto: CreatePedidoDto,

    @Req()
    request: RequestAutenticada,
  ) {
    return this.pedidosService.create(createPedidoDto, request.user);
  }

  @Post(':id/detalles')
  @Permisos('PEDIDOS_EDITAR')
  agregarDetalles(
    @Param('id', ParseIntPipe)
    id: number,

    @Body()
    data: AgregarDetallesPedidoDto,

    @Req()
    request: RequestAutenticada,
  ) {
    return this.pedidosService.agregarDetalles(id, data, request.user);
  }

  @Patch(':id/cancelar')
  @Permisos('PEDIDOS_CANCELAR')
  cancelar(
    @Param('id', ParseIntPipe)
    id: number,

    @Req()
    request: RequestAutenticada,
  ) {
    return this.pedidosService.cancelar(id, request.user);
  }

  @Patch(':id/finalizar-servicio')
  @Permisos('PEDIDOS_EDITAR')
  finalizarServicio(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: RequestAutenticada,
  ) {
    return this.pedidosService.finalizarServicio(id, request.user);
  }

  @Get()
  @Permisos('PEDIDOS_VER')
  findAll(
    @Req()
    request: RequestAutenticada,
  ) {
    return this.pedidosService.findAll(request.user);
  }

  @Get('domicilios/activos')
  @Permisos('PEDIDOS_VER')
  listarDomicilios(@Req() request: RequestAutenticada) {
    return this.pedidosService.listarDomicilios(request.user);
  }

  @Patch('domicilios/:id/estado')
  @Permisos('PEDIDOS_EDITAR')
  actualizarDomicilio(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: ActualizarDomicilioDto,
    @Req() request: RequestAutenticada,
  ) {
    return this.pedidosService.actualizarDomicilio(id, data, request.user);
  }

  @Get(':id')
  @Permisos('PEDIDOS_VER')
  findOne(
    @Param('id', ParseIntPipe)
    id: number,

    @Req()
    request: RequestAutenticada,
  ) {
    return this.pedidosService.findOne(id, request.user);
  }
}
