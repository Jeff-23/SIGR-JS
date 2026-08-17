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

import { ArticulosService } from './articulos.service';
import { CreateArticuloDto } from './dto/create-articulo.dto';
import { UpdateArticuloDto } from './dto/update-articulo.dto';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permisos } from '../auth/permisos.decorator';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';

type RequestAutenticada = {
  user: UsuarioAutenticado;
};

@Controller('articulos')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ArticulosController {
  constructor(
    private readonly articulosService: ArticulosService,
  ) {}

  @Post()
  @Permisos('INVENTARIO_AJUSTAR')
  create(
    @Body() createArticuloDto: CreateArticuloDto,
    @Req() request: RequestAutenticada,
  ) {
    return this.articulosService.create(
      createArticuloDto,
      request.user,
    );
  }

  @Get()
  @Permisos('INVENTARIO_VER')
  findAll(
    @Req() request: RequestAutenticada,
  ) {
    return this.articulosService.findAll(
      request.user,
    );
  }

  @Get(':id')
  @Permisos('INVENTARIO_VER')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: RequestAutenticada,
  ) {
    return this.articulosService.findOne(
      id,
      request.user,
    );
  }

  @Patch(':id')
  @Permisos('INVENTARIO_AJUSTAR')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateData: UpdateArticuloDto,
    @Req() request: RequestAutenticada,
  ) {
    return this.articulosService.update(
      id,
      updateData,
      request.user,
    );
  }
}

