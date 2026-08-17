import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { MesasService } from './mesas.service';
import { CreateMesaDto } from './dto/create-mesa.dto';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';

type RequestAutenticada = {
  user: UsuarioAutenticado;
};

@Controller('mesas')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MesasController {
  constructor(
    private readonly mesasService: MesasService,
  ) {}

  @Post()
  @Roles('ADMIN')
  create(
    @Body() createMesaDto: CreateMesaDto,
    @Req() request: RequestAutenticada,
  ) {
    return this.mesasService.create(
      createMesaDto,
      request.user,
    );
  }

  @Get()
  findAll(
    @Req() request: RequestAutenticada,
  ) {
    return this.mesasService.findAll(
      request.user,
    );
  }
}