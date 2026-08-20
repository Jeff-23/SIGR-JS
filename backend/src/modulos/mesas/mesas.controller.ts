import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';

import { MesasService } from './mesas.service';
import { CreateMesaDto } from './dto/create-mesa.dto';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permisos } from '../auth/permisos.decorator';
import { CapabilitiesGuard } from '../auth/capabilities.guard';
import { Capacidades } from '../auth/capacidades.decorator';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';

type RequestAutenticada = {
  user: UsuarioAutenticado;
};

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
}
