import {
  Controller,
  Get,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { DashboardService } from './dashboard.service';
import { FiltroReportesDto } from '../reportes/dto/filtro-reportes.dto';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CapabilitiesGuard } from '../auth/capabilities.guard';
import { Permisos } from '../auth/permisos.decorator';
import { Capacidades } from '../auth/capacidades.decorator';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';

type RequestAutenticada = {
  user: UsuarioAutenticado;
};

@Controller('dashboard')
@UseGuards(
  JwtAuthGuard,
  PermissionsGuard,
  CapabilitiesGuard,
)
@Permisos('REPORTES_VER')
@Capacidades('ANALYTICS')
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
  ) {}

  @Get('resumen')
  resumen(
    @Query() filtros: FiltroReportesDto,
    @Req() request: RequestAutenticada,
  ) {
    return this.dashboardService.resumen(
      filtros,
      request.user,
    );
  }
}
