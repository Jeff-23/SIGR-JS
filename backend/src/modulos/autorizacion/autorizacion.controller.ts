import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permisos } from '../auth/permisos.decorator';
import {
  construirContextoAuditoria,
  RequestAuditable,
} from '../auditoria/auditoria-contexto';
import { AuditoriaDetallada } from '../auditoria/auditoria-detallada.decorator';
import { AutorizacionService } from './autorizacion.service';
import { ActualizarCodigosDto } from './dto/actualizar-codigos.dto';
import { AsignarPlanDto } from './dto/asignar-plan.dto';

@Controller('autorizacion')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@AuditoriaDetallada()
export class AutorizacionController {
  constructor(private readonly autorizacionService: AutorizacionService) {}

  @Get('catalogo')
  @Permisos('AUTORIZACION_VER')
  catalogo(@Req() request: RequestAuditable) {
    return this.autorizacionService.catalogo(request.user);
  }

  @Get('roles')
  @Permisos('AUTORIZACION_VER')
  listarRoles(@Req() request: RequestAuditable) {
    return this.autorizacionService.listarRoles(request.user);
  }

  @Put('restaurantes/:restauranteId/plan')
  @Permisos('AUTORIZACION_GESTIONAR')
  asignarPlan(
    @Param('restauranteId', ParseIntPipe) restauranteId: number,
    @Body() data: AsignarPlanDto,
    @Req() request: RequestAuditable,
  ) {
    return this.autorizacionService.asignarPlan(
      restauranteId,
      data.planId,
      request.user,
      construirContextoAuditoria(request),
    );
  }

  @Put('planes/:planId/capacidades')
  @Permisos('AUTORIZACION_GESTIONAR')
  actualizarCapacidadesPlan(
    @Param('planId', ParseIntPipe) planId: number,
    @Body() data: ActualizarCodigosDto,
    @Req() request: RequestAuditable,
  ) {
    return this.autorizacionService.actualizarCapacidadesPlan(
      planId,
      data.codigos,
      request.user,
      construirContextoAuditoria(request),
    );
  }

  @Put('roles/:rolId/permisos')
  @Permisos('AUTORIZACION_GESTIONAR')
  actualizarPermisosRol(
    @Param('rolId', ParseIntPipe) rolId: number,
    @Body() data: ActualizarCodigosDto,
    @Req() request: RequestAuditable,
  ) {
    return this.autorizacionService.actualizarPermisosRol(
      rolId,
      data.codigos,
      request.user,
      construirContextoAuditoria(request),
    );
  }
}
