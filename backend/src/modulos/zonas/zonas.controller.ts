import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { ZonasService } from './zonas.service';
import { CreateZonaDto } from './dto/create-zona.dto';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permisos } from '../auth/permisos.decorator';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';

type RequestAutenticada = {
  user: UsuarioAutenticado;
};

@Controller('zonas')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ZonasController {
  constructor(private readonly zonasService: ZonasService) {}

  @Post()
  @Permisos('ZONAS_CREAR')
  create(
    @Body() createZonaDto: CreateZonaDto,
    @Req() request: RequestAutenticada,
  ) {
    return this.zonasService.create(createZonaDto, request.user);
  }

  @Get('sucursal/:sucursalId')
  @Permisos('ZONAS_VER')
  findAllPorSucursal(
    @Param('sucursalId', ParseIntPipe)
    sucursalId: number,
    @Req() request: RequestAutenticada,
  ) {
    return this.zonasService.findAllPorSucursal(sucursalId, request.user);
  }
}
