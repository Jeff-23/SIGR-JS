import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
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
import { ConfiguracionService } from './configuracion.service';
import { ActualizarConfiguracionDto } from './dto/actualizar-configuracion.dto';

@Controller('configuracion')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@AuditoriaDetallada()
export class ConfiguracionController {
  constructor(private readonly configuracionService: ConfiguracionService) {}

  @Get('restaurante')
  @Permisos('CONFIGURACION_VER')
  listarRestaurante(@Req() request: RequestAuditable) {
    return this.configuracionService.listarRestaurante(request.user);
  }

  @Patch('restaurante/:clave')
  @Permisos('CONFIGURACION_GESTIONAR')
  actualizarRestaurante(
    @Param('clave') clave: string,
    @Body() data: ActualizarConfiguracionDto,
    @Req() request: RequestAuditable,
  ) {
    return this.configuracionService.actualizarRestaurante(
      clave,
      data.valor,
      request.user,
      construirContextoAuditoria(request),
    );
  }

  @Get('sucursales/:sucursalId')
  @Permisos('CONFIGURACION_VER')
  listarSucursal(
    @Param('sucursalId', ParseIntPipe) sucursalId: number,
    @Req() request: RequestAuditable,
  ) {
    return this.configuracionService.listarSucursal(sucursalId, request.user);
  }

  @Patch('sucursales/:sucursalId/:clave')
  @Permisos('CONFIGURACION_GESTIONAR')
  actualizarSucursal(
    @Param('sucursalId', ParseIntPipe) sucursalId: number,
    @Param('clave') clave: string,
    @Body() data: ActualizarConfiguracionDto,
    @Req() request: RequestAuditable,
  ) {
    return this.configuracionService.actualizarSucursal(
      sucursalId,
      clave,
      data.valor,
      request.user,
      construirContextoAuditoria(request),
    );
  }

  @Get('efectiva/:sucursalId')
  @Permisos('CONFIGURACION_VER')
  obtenerEfectiva(
    @Param('sucursalId', ParseIntPipe) sucursalId: number,
    @Req() request: RequestAuditable,
  ) {
    return this.configuracionService.obtenerEfectiva(sucursalId, request.user);
  }
}
