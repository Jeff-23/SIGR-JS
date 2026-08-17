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
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';

type RequestAutenticada = {
  user: UsuarioAutenticado;
};

@Controller('zonas')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ZonasController {
  constructor(
    private readonly zonasService: ZonasService,
  ) {}

  @Post()
  @Roles('ADMIN')
  create(
    @Body() createZonaDto: CreateZonaDto,
    @Req() request: RequestAutenticada,
  ) {
    return this.zonasService.create(
      createZonaDto,
      request.user,
    );
  }

  @Get('sucursal/:sucursalId')
  findAllPorSucursal(
    @Param('sucursalId', ParseIntPipe)
    sucursalId: number,
    @Req() request: RequestAutenticada,
  ) {
    return this.zonasService.findAllPorSucursal(
      sucursalId,
      request.user,
    );
  }
}