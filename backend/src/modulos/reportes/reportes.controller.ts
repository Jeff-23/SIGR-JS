import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';

import { ReportesService } from './reportes.service';
import {
  FiltroReportesDto,
  FiltroTopProductosDto,
} from './dto/filtro-reportes.dto';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CapabilitiesGuard } from '../auth/capabilities.guard';
import { Permisos } from '../auth/permisos.decorator';
import { Capacidades } from '../auth/capacidades.decorator';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';

type RequestAutenticada = {
  user: UsuarioAutenticado;
};

@Controller('reportes')
@UseGuards(JwtAuthGuard, PermissionsGuard, CapabilitiesGuard)
@Permisos('REPORTES_VER')
@Capacidades('ANALYTICS')
export class ReportesController {
  constructor(private readonly reportesService: ReportesService) {}

  @Get('resumen')
  resumen(
    @Query() filtros: FiltroReportesDto,
    @Req() request: RequestAutenticada,
  ) {
    return this.reportesService.resumen(filtros, request.user);
  }

  @Get('ventas-diarias')
  ventasDiarias(
    @Query() filtros: FiltroReportesDto,
    @Req() request: RequestAutenticada,
  ) {
    return this.reportesService.ventasDiarias(filtros, request.user);
  }

  @Get('productos-mas-vendidos')
  productosMasVendidos(
    @Query() filtros: FiltroTopProductosDto,
    @Req() request: RequestAutenticada,
  ) {
    return this.reportesService.productosMasVendidos(filtros, request.user);
  }

  @Get('metodos-pago')
  metodosPago(
    @Query() filtros: FiltroReportesDto,
    @Req() request: RequestAutenticada,
  ) {
    return this.reportesService.metodosPago(filtros, request.user);
  }

  @Get('inventario-sin-stock')
  inventarioSinStock(
    @Query() filtros: FiltroReportesDto,
    @Req() request: RequestAutenticada,
  ) {
    return this.reportesService.inventarioSinStock(filtros, request.user);
  }
}
