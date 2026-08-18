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

import { VentasService } from './ventas.service';

import {
  CrearVentaDirectaDto,
  CrearVentaManualDto,
  CrearVentaPedidoDto,
} from './dto/crear-venta.dto';

import { RegistrarPagoDto } from './dto/registrar-pago.dto';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permisos } from '../auth/permisos.decorator';

import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';

type RequestAutenticada = {
  user: UsuarioAutenticado;
};

@Controller('ventas')
@UseGuards(
  JwtAuthGuard,
  PermissionsGuard,
)
export class VentasController {
  constructor(
    private readonly ventasService: VentasService,
  ) {}

  @Post('pedido')
  @Permisos('VENTAS_CREAR')
  crearDesdePedido(
    @Body() data: CrearVentaPedidoDto,
    @Req() request: RequestAutenticada,
  ) {
    return this.ventasService.crearDesdePedido(
      data,
      request.user,
    );
  }

  @Post('directa')
  @Permisos('VENTAS_CREAR')
  crearDirecta(
    @Body() data: CrearVentaDirectaDto,
    @Req() request: RequestAutenticada,
  ) {
    return this.ventasService.crearDirecta(
      data,
      request.user,
    );
  }

  @Post('manual')
  @Permisos(
    'VENTAS_CREAR',
    'VENTAS_REGISTRAR_MANUAL',
  )
  crearManual(
    @Body() data: CrearVentaManualDto,
    @Req() request: RequestAutenticada,
  ) {
    return this.ventasService.crearManual(
      data,
      request.user,
    );
  }

  @Get()
  @Permisos('VENTAS_VER')
  findAll(
    @Req() request: RequestAutenticada,
  ) {
    return this.ventasService.findAll(
      request.user,
    );
  }

  @Get(':id')
  @Permisos('VENTAS_VER')
  findOne(
    @Param('id', ParseIntPipe)
    id: number,

    @Req() request: RequestAutenticada,
  ) {
    return this.ventasService.findOne(
      id,
      request.user,
    );
  }

  @Post(':id/pagos')
  @Permisos('PAGOS_REGISTRAR')
  registrarPago(
    @Param('id', ParseIntPipe)
    id: number,

    @Body()
    data: RegistrarPagoDto,

    @Req() request: RequestAutenticada,
  ) {
    return this.ventasService.registrarPago(
      id,
      data,
      request.user,
    );
  }

  @Patch(':id/anular')
  @Permisos('VENTAS_ANULAR')
  anular(
    @Param('id', ParseIntPipe)
    id: number,

    @Req() request: RequestAutenticada,
  ) {
    return this.ventasService.anular(
      id,
      request.user,
    );
  }
}