import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { FacturasService } from './facturas.service';

import { CreateFacturaDto } from './dto/create-factura.dto';

import { CreateFacturaVentaDto } from './dto/create-factura-venta.dto';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';

import { PermissionsGuard } from '../auth/permissions.guard';

import { Permisos } from '../auth/permisos.decorator';

import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';

type RequestAutenticada = {
  user: UsuarioAutenticado;
};

@Controller('facturas')
@UseGuards(
  JwtAuthGuard,
  PermissionsGuard,
)
export class FacturasController {
  constructor(
    private readonly facturasService:
      FacturasService,
  ) {}

  /*
   * Flujo legacy temporal:
   * Pedido -> Factura -> Pago.
   */
  @Post()
  @Permisos('FACTURAS_EMITIR')
  create(
    @Body()
    createFacturaDto: CreateFacturaDto,

    @Req()
    request: RequestAutenticada,
  ) {
    return this.facturasService.create(
      createFacturaDto,
      request.user,
    );
  }

  /*
   * Nuevo flujo:
   * Venta -> Factura.
   */
  @Post('venta')
  @Permisos('FACTURAS_EMITIR')
  crearDesdeVenta(
    @Body()
    data: CreateFacturaVentaDto,

    @Req()
    request: RequestAutenticada,
  ) {
    return this.facturasService.crearDesdeVenta(
      data.ventaId,
      request.user,
    );
  }

  @Get('corte-caja')
  @Permisos('FACTURAS_VER')
  obtenerCorteCaja(
    @Query('inicio')
    inicio: string | undefined,

    @Query('fin')
    fin: string | undefined,

    @Req()
    request: RequestAutenticada,
  ) {
    return this.facturasService.obtenerCorteCaja(
      inicio,
      fin,
      request.user,
    );
  }
}