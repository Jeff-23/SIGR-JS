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
import { CapabilitiesGuard } from '../auth/capabilities.guard';
import { Capacidades } from '../auth/capacidades.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permisos } from '../auth/permisos.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';
import { CambiarOcupacionMesaDto } from './dto/cambiar-ocupacion-mesa.dto';
import { CreateMesaDto } from './dto/create-mesa.dto';
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
  findAll(@Req() request: RequestAutenticada) {
    return this.mesasService.findAll(request.user);
  }

  @Patch(':id/ocupar-sin-pedido')
  @Permisos('MESAS_EDITAR')
  ocuparSinPedido(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: CambiarOcupacionMesaDto,
    @Req() request: RequestAutenticada,
  ) {
    return this.mesasService.ocuparSinPedido(id, data.motivo, request.user);
  }

  @Patch(':id/liberar-sin-consumo')
  @Permisos('MESAS_EDITAR')
  liberarSinConsumo(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: CambiarOcupacionMesaDto,
    @Req() request: RequestAutenticada,
  ) {
    return this.mesasService.liberarSinConsumo(id, data.motivo, request.user);
  }
}
