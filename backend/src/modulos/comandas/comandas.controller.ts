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

import { ComandasService } from './comandas.service';

import { CrearComandaDto } from './dto/crear-comanda.dto';
import { ActualizarEstadoComandaDto } from './dto/actualizar-estado-comanda.dto';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permisos } from '../auth/permisos.decorator';

import { CapabilitiesGuard } from '../auth/capabilities.guard';
import { Capacidades } from '../auth/capacidades.decorator';

import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';

type RequestAutenticada = {
  user: UsuarioAutenticado;
};

@Controller()
@UseGuards(
  JwtAuthGuard,
  PermissionsGuard,
  CapabilitiesGuard,
)
@Capacidades('KDS')
export class ComandasController {
  constructor(
    private readonly comandasService: ComandasService,
  ) {}

  @Post('pedidos/:pedidoId/comandas')
  @Permisos('COMANDAS_ENVIAR')
  crear(
    @Param('pedidoId', ParseIntPipe)
    pedidoId: number,

    @Body()
    data: CrearComandaDto,

    @Req()
    request: RequestAutenticada,
  ) {
    return this.comandasService.crear(
      pedidoId,
      data,
      request.user,
    );
  }

  @Get('comandas')
  @Permisos('COMANDAS_VER')
  listarKds(
    @Req()
    request: RequestAutenticada,
  ) {
    return this.comandasService.listarKds(
      request.user,
    );
  }

  @Patch('comandas/:id/estado')
  @Permisos('COMANDAS_ACTUALIZAR_ESTADO')
  actualizarEstado(
    @Param('id', ParseIntPipe)
    id: number,

    @Body()
    data: ActualizarEstadoComandaDto,

    @Req()
    request: RequestAutenticada,
  ) {
    return this.comandasService.actualizarEstado(
      id,
      data.estado,
      request.user,
    );
  }
}