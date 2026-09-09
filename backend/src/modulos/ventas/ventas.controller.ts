import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { VentasService } from './ventas.service';

import {
  CrearVentaDirectaDto,
  CrearVentaManualDto,
  CrearVentaPedidoDto,
} from './dto/crear-venta.dto';

import { RegistrarPagoDto } from './dto/registrar-pago.dto';
import { DevolverPagoDto, ReversarVentaDto } from './dto/devolver-pago.dto';
import { ListarVentasDto } from './dto/listar-ventas.dto';
import { DividirCuentaDto } from './dto/dividir-cuenta.dto';
import { ActualizarLiquidacionVentaDto } from './dto/actualizar-liquidacion-venta.dto';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permisos } from '../auth/permisos.decorator';

import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';

type RequestAutenticada = {
  user: UsuarioAutenticado;
};

@Controller('ventas')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class VentasController {
  constructor(private readonly ventasService: VentasService) {}

  @Post('pedido')
  @Permisos('VENTAS_CREAR')
  crearDesdePedido(
    @Body()
    data: CrearVentaPedidoDto,

    @Headers('idempotency-key')
    claveIdempotencia: string | undefined,

    @Req()
    request: RequestAutenticada,
  ) {
    return this.ventasService.crearDesdePedido(
      data,
      request.user,
      claveIdempotencia,
    );
  }

  @Post('pedido-operativo')
  @Permisos('PEDIDOS_EDITAR')
  crearDesdePedidoOperativo(
    @Body() data: CrearVentaPedidoDto,
    @Headers('idempotency-key') claveIdempotencia: string | undefined,
    @Req() request: RequestAutenticada,
  ) {
    return this.ventasService.crearDesdePedido(
      data,
      request.user,
      claveIdempotencia,
    );
  }

  @Post('directa')
  @Permisos('VENTAS_CREAR')
  crearDirecta(
    @Body()
    data: CrearVentaDirectaDto,

    @Headers('idempotency-key')
    claveIdempotencia: string | undefined,

    @Req()
    request: RequestAutenticada,
  ) {
    return this.ventasService.crearDirecta(
      data,
      request.user,
      claveIdempotencia,
    );
  }

  @Post('manual')
  @Permisos('VENTAS_CREAR', 'VENTAS_REGISTRAR_MANUAL')
  crearManual(
    @Body()
    data: CrearVentaManualDto,

    @Headers('idempotency-key')
    claveIdempotencia: string | undefined,

    @Req()
    request: RequestAutenticada,
  ) {
    return this.ventasService.crearManual(
      data,
      request.user,
      claveIdempotencia,
    );
  }

  @Get()
  @Permisos('VENTAS_VER')
  findAll(
    @Req()
    request: RequestAutenticada,
    @Query() filtros: ListarVentasDto,
  ) {
    return this.ventasService.findAll(request.user, filtros);
  }

  /*
   * Corte COMERCIAL.
   *
   * Se basa en Venta.fechaOperacion.
   *
   * No representa todavía un cierre
   * formal de caja.
   */
  @Get('corte-comercial')
  @Permisos('VENTAS_VER')
  obtenerCorteComercial(
    @Query('inicio')
    inicio: string | undefined,

    @Query('fin')
    fin: string | undefined,

    @Req()
    request: RequestAutenticada,
  ) {
    return this.ventasService.obtenerCorteComercial(inicio, fin, request.user);
  }

  /*
   * IMPORTANTE:
   * dejar esta ruta después de
   * /corte-comercial.
   */
  @Get(':id/comprobante-pos')
  @Permisos('VENTAS_VER')
  comprobantePos(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: RequestAutenticada,
  ) {
    return this.ventasService.comprobantePos(id, request.user);
  }

  @Get(':id')
  @Permisos('VENTAS_VER')
  findOne(
    @Param('id', ParseIntPipe)
    id: number,

    @Req()
    request: RequestAutenticada,
  ) {
    return this.ventasService.findOne(id, request.user);
  }

  @Post(':id/pagos')
  @Permisos('PAGOS_REGISTRAR')
  registrarPago(
    @Param('id', ParseIntPipe)
    id: number,

    @Body()
    data: RegistrarPagoDto,

    @Headers('idempotency-key')
    claveIdempotencia: string | undefined,

    @Req()
    request: RequestAutenticada,
  ) {
    return this.ventasService.registrarPago(
      id,
      data,
      request.user,
      claveIdempotencia,
    );
  }

  @Patch(':id/liquidacion')
  @Permisos('VENTAS_CREAR')
  actualizarLiquidacion(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: ActualizarLiquidacionVentaDto,
    @Req() request: RequestAutenticada,
  ) {
    return this.ventasService.actualizarLiquidacion(id, data, request.user);
  }

  @Patch(':id/anular')
  @Permisos('VENTAS_ANULAR')
  anular(
    @Param('id', ParseIntPipe)
    id: number,

    @Req()
    request: RequestAutenticada,
  ) {
    return this.ventasService.anular(id, request.user);
  }

  @Post(':ventaId/pagos/:pagoId/devoluciones')
  @Permisos('PAGOS_REGISTRAR')
  devolverPago(
    @Param('ventaId', ParseIntPipe) ventaId: number,
    @Param('pagoId', ParseIntPipe) pagoId: number,
    @Body() data: DevolverPagoDto,
    @Headers('idempotency-key') clave: string | undefined,
    @Req() request: RequestAutenticada,
  ) {
    return this.ventasService.devolverPago(
      ventaId,
      pagoId,
      data,
      request.user,
      clave,
    );
  }

  @Post(':id/reversar')
  @Permisos('VENTAS_ANULAR')
  reversar(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: ReversarVentaDto,
    @Headers('idempotency-key') clave: string | undefined,
    @Req() request: RequestAutenticada,
  ) {
    return this.ventasService.reversar(id, data, request.user, clave);
  }

  @Post(':id/division-cuenta-operativa')
  @Permisos('PEDIDOS_EDITAR')
  dividirCuentaOperativa(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: DividirCuentaDto,
    @Req() request: RequestAutenticada,
  ) {
    return this.ventasService.dividirCuenta(id, data, request.user);
  }

  @Post(':id/division-cuenta')
  @Permisos('VENTAS_CREAR')
  dividirCuenta(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: DividirCuentaDto,
    @Req() request: RequestAutenticada,
  ) {
    return this.ventasService.dividirCuenta(id, data, request.user);
  }
}
