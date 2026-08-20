import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permisos } from '../auth/permisos.decorator';
import { CapabilitiesGuard } from '../auth/capabilities.guard';
import { Capacidades } from '../auth/capacidades.decorator';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';

import { AjustarInventarioDto } from './dto/ajustar-inventario.dto';
import { ListarExistenciasInventarioDto } from './dto/listar-existencias-inventario.dto';
import { ListarMovimientosInventarioDto } from './dto/listar-movimientos-inventario.dto';
import { InventarioService } from './inventario.service';

type RequestAutenticada = {
  user: UsuarioAutenticado;
};

@Controller('inventario')
@UseGuards(JwtAuthGuard, PermissionsGuard, CapabilitiesGuard)
@Capacidades('INVENTARIO')
export class InventarioController {
  constructor(private readonly inventarioService: InventarioService) {}

  @Get('existencias')
  @Permisos('INVENTARIO_VER')
  existencias(
    @Query()
    filtros: ListarExistenciasInventarioDto,
    @Req()
    request: RequestAutenticada,
  ) {
    return this.inventarioService.existencias(filtros, request.user);
  }

  @Get('movimientos')
  @Permisos('INVENTARIO_VER')
  movimientos(
    @Query()
    filtros: ListarMovimientosInventarioDto,
    @Req()
    request: RequestAutenticada,
  ) {
    return this.inventarioService.movimientos(filtros, request.user);
  }

  @Post('ajustes')
  @Permisos('INVENTARIO_AJUSTAR')
  ajustar(
    @Body()
    data: AjustarInventarioDto,
    @Req()
    request: RequestAutenticada,
  ) {
    return this.inventarioService.ajustar(data, request.user);
  }
}
