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

import { CategoriasService } from './categorias.service';
import {
  CreateCategoriaDto,
  UpdateCategoriaDto,
} from './dto/create-categoria.dto';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permisos } from '../auth/permisos.decorator';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';

type RequestAutenticada = {
  user: UsuarioAutenticado;
};

@Controller('categorias')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CategoriasController {
  constructor(private readonly categoriasService: CategoriasService) {}

  @Post()
  @Permisos('CATEGORIAS_CREAR')
  create(
    @Body() createCategoriaDto: CreateCategoriaDto,
    @Req() request: RequestAutenticada,
  ) {
    return this.categoriasService.create(createCategoriaDto, request.user);
  }

  @Patch(':id')
  @Permisos('CATEGORIAS_EDITAR')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: UpdateCategoriaDto,
    @Req() request: RequestAutenticada,
  ) {
    return this.categoriasService.update(id, data, request.user);
  }

  @Get('sucursal/:sucursalId')
  @Permisos('CATEGORIAS_VER')
  findAllPorSucursal(
    @Param('sucursalId', ParseIntPipe)
    sucursalId: number,
    @Req() request: RequestAutenticada,
  ) {
    return this.categoriasService.findAllPorSucursal(sucursalId, request.user);
  }
}
