import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permisos } from '../auth/permisos.decorator';
import type { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';
import { AuditoriaDetallada } from '../auditoria/auditoria-detallada.decorator';
import { CierreDistribucionService } from './cierre-distribucion.service';
import { ActualizarCierreDistribucionDto } from './dto/actualizar-cierre-distribucion.dto';

type RequestAutenticada = { user: UsuarioAutenticado };

@Controller('cierre-distribucion')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@AuditoriaDetallada()
export class CierreDistribucionController {
  constructor(private readonly service: CierreDistribucionService) {}

  @Get('configuracion')
  @Permisos('CONFIGURACION_VER')
  configuracion(
    @Query('sucursalId', ParseIntPipe) sucursalId: number,
    @Req() request: RequestAutenticada,
  ) {
    return this.service.obtenerConfiguracion(sucursalId, request.user);
  }

  @Patch('configuracion/:sucursalId')
  @Permisos('CONFIGURACION_GESTIONAR')
  actualizar(
    @Param('sucursalId', ParseIntPipe) sucursalId: number,
    @Body() data: ActualizarCierreDistribucionDto,
    @Req() request: RequestAutenticada,
  ) {
    return this.service.actualizarConfiguracion(sucursalId, data, request.user);
  }

  @Get('envios')
  @Permisos('CONFIGURACION_VER')
  envios(
    @Query('sucursalId', ParseIntPipe) sucursalId: number,
    @Req() request: RequestAutenticada,
  ) {
    return this.service.listarEnvios(sucursalId, request.user);
  }
}
