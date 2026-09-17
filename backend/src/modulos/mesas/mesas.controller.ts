import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CapabilitiesGuard } from '../auth/capabilities.guard';
import { Capacidades } from '../auth/capacidades.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permisos } from '../auth/permisos.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';
import { CambiarOcupacionMesaDto } from './dto/cambiar-ocupacion-mesa.dto';
import { CreateMesaDto } from './dto/create-mesa.dto';
import { ActualizarMesaDto } from './dto/actualizar-mesa.dto';
import { MesasService } from './mesas.service';

type RequestAutenticada = { user: UsuarioAutenticado };

@Controller('mesas')
@UseGuards(JwtAuthGuard, PermissionsGuard, CapabilitiesGuard)
@Capacidades('MESAS')
export class MesasController {
  constructor(private readonly mesasService: MesasService) {}

  @Post()
  @Permisos('MESAS_CREAR')
  create(
    @Body() createMesaDto: CreateMesaDto,
    @Req() request: RequestAutenticada,
  ) {
    return this.mesasService.create(createMesaDto, request.user);
  }

  @Get()
  @Permisos('MESAS_VER')
  findAll(
    @Req() request: RequestAutenticada,
    @Query('sucursalId', new ParseIntPipe({ optional: true }))
    sucursalId?: number,
    @Query('incluirInactivas') incluirInactivas?: string,
  ) {
    return this.mesasService.findAll(
      request.user,
      sucursalId,
      incluirInactivas === 'true',
    );
  }

  @Patch(':id')
  @Permisos('MESAS_EDITAR')
  actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: ActualizarMesaDto,
    @Req() request: RequestAutenticada,
  ) {
    return this.mesasService.actualizar(id, data, request.user);
  }

  @Patch(':id/estado')
  @Permisos('MESAS_EDITAR')
  cambiarEstado(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: { activo: boolean },
    @Req() request: RequestAutenticada,
  ) {
    return this.mesasService.cambiarEstado(
      id,
      Boolean(data.activo),
      request.user,
    );
  }

  @Patch(':id/ocupar-sin-pedido')
  ocuparSinPedido(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: CambiarOcupacionMesaDto,
    @Req() request: RequestAutenticada,
  ) {
    this.validarOperacionManual(request.user);
    return this.mesasService.ocuparSinPedido(id, data.motivo, request.user);
  }

  @Patch(':id/liberar-sin-consumo')
  liberarSinConsumo(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: CambiarOcupacionMesaDto,
    @Req() request: RequestAutenticada,
  ) {
    this.validarOperacionManual(request.user);
    return this.mesasService.liberarSinConsumo(id, data.motivo, request.user);
  }

  private validarOperacionManual(usuario: UsuarioAutenticado) {
    const esSuperadmin =
      usuario.rol === 'SUPERADMIN' && usuario.restauranteId === null;
    const puedeOperar =
      usuario.permisos.includes('MESAS_EDITAR') ||
      usuario.permisos.includes('PEDIDOS_CREAR');

    if (!esSuperadmin && !puedeOperar) {
      throw new ForbiddenException(
        'No tienes permisos para ocupar o liberar mesas sin consumo',
      );
    }
  }
}
