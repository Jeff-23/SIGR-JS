import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';

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
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FacturasController {
  constructor(private readonly facturasService: FacturasService) {}

  /*
   * =====================================================
   * FLUJO LEGACY RETIRADO
   * =====================================================
   *
   * Esta ruta se conserva temporalmente para que
   * clientes antiguos reciban un error explicativo
   * en lugar de un 404.
   *
   * Ya NO se permite:
   *
   * Pedido -> Factura -> Pago
   *
   * El flujo vigente es:
   *
   * Pedido -> Venta -> Pago
   *                  -> Factura
   */
  @Post()
  @Permisos('FACTURAS_EMITIR')
  createLegacy(
    @Body()
    data: CreateFacturaDto,

    @Req()
    request: RequestAutenticada,
  ) {
    return this.facturasService.createLegacy(data, request.user);
  }

  /*
   * =====================================================
   * FLUJO VIGENTE
   * =====================================================
   *
   * Venta -> Factura
   *
   * Factura no crea pagos.
   * Factura no libera mesas.
   * Factura no cambia el estado de Venta.
   * Factura no cambia el estado operativo del Pedido.
   */
  @Post('venta')
  @Permisos('FACTURAS_EMITIR')
  crearDesdeVenta(
    @Body()
    data: CreateFacturaVentaDto,

    @Req()
    request: RequestAutenticada,
  ) {
    return this.facturasService.crearDesdeVenta(data.ventaId, request.user);
  }
}
