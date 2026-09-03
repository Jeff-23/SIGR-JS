import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  Query,
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
import { ActualizarContextoPedidoDto } from './dto/actualizar-contexto-pedido.dto';
import { ActualizarDetallePedidoDto } from './dto/actualizar-detalle-pedido.dto';
import {
  CambiarMeseroDto,
  SepararMesaDto,
  TrasladarMesaDto,
  UnirMesasDto,
} from './dto/gestionar-servicio-mesa.dto';

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

    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.pedidosService.create(
      createPedidoDto,
      request.user,
      idempotencyKey,
    );
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

  @Patch(':id/contexto')
  @Permisos('PEDIDOS_EDITAR')
  actualizarContexto(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: ActualizarContextoPedidoDto,
    @Req() request: RequestAutenticada,
  ) {
    return this.pedidosService.actualizarContexto(id, data, request.user);
  }

  @Patch(':id/detalles/:detalleId')
  @Permisos('PEDIDOS_EDITAR')
  actualizarDetalle(
    @Param('id', ParseIntPipe) id: number,
    @Param('detalleId', ParseIntPipe) detalleId: number,
    @Body() data: ActualizarDetallePedidoDto,
    @Req() request: RequestAutenticada,
  ) {
    return this.pedidosService.actualizarDetalle(
      id,
      detalleId,
      data,
      request.user,
    );
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

  @Patch(':id/entregado')
  @Permisos('PEDIDOS_EDITAR')
  marcarEntregado(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: RequestAutenticada,
  ) {
    return this.pedidosService.marcarEntregado(id, request.user);
  }

  @Post(':id/solicitar-cuenta')
  @Permisos('PEDIDOS_EDITAR', 'VENTAS_CREAR')
  solicitarCuenta(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: RequestAutenticada,
  ) {
    return this.pedidosService.solicitarCuenta(id, request.user);
  }

  @Patch(':id/finalizar-servicio')
  @Permisos('PEDIDOS_EDITAR')
  finalizarServicio(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: RequestAutenticada,
  ) {
    return this.pedidosService.finalizarServicio(id, request.user);
  }

  @Post(':id/mesas/unir')
  @Permisos('PEDIDOS_EDITAR', 'MESAS_EDITAR')
  unirMesas(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: UnirMesasDto,
    @Req() request: RequestAutenticada,
  ) {
    return this.pedidosService.unirMesas(id, data.mesaIds, request.user);
  }

  @Post(':id/mesas/trasladar')
  @Permisos('PEDIDOS_EDITAR', 'MESAS_EDITAR')
  trasladarMesa(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: TrasladarMesaDto,
    @Req() request: RequestAutenticada,
  ) {
    return this.pedidosService.trasladarMesa(
      id,
      data.mesaDestinoId,
      request.user,
    );
  }

  @Post(':id/mesas/separar')
  @Permisos('PEDIDOS_EDITAR', 'MESAS_EDITAR')
  separarMesa(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: SepararMesaDto,
    @Req() request: RequestAutenticada,
  ) {
    return this.pedidosService.separarMesa(id, data.mesaId, request.user);
  }

  @Patch(':id/mesero')
  @Permisos('PEDIDOS_EDITAR')
  cambiarMesero(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: CambiarMeseroDto,
    @Req() request: RequestAutenticada,
  ) {
    return this.pedidosService.cambiarMesero(id, data.meseroId, request.user);
  }

  @Get()
  @Permisos('PEDIDOS_VER')
  findAll(
    @Req()
    request: RequestAutenticada,
    @Query('sucursalId', new ParseIntPipe({ optional: true }))
    sucursalId?: number,
  ) {
    return this.pedidosService.findAll(request.user, sucursalId);
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

  @Get(':id/trazabilidad')
  @Permisos('PEDIDOS_VER')
  trazabilidad(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: RequestAutenticada,
  ) {
    return this.pedidosService.trazabilidad(id, request.user);
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
