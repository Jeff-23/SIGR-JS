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

import { CategoriasService } from './categorias.service';
import { CreateCategoriaDto } from './dto/create-categoria.dto';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';

type RequestAutenticada = {
  user: UsuarioAutenticado;
};

@Controller('categorias')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CategoriasController {
  constructor(
    private readonly categoriasService: CategoriasService,
  ) {}

  @Post()
  @Roles('ADMIN')
  create(
    @Body() createCategoriaDto: CreateCategoriaDto,
    @Req() request: RequestAutenticada,
  ) {
    return this.categoriasService.create(
      createCategoriaDto,
      request.user,
    );
  }

  @Get('sucursal/:sucursalId')
  findAllPorSucursal(
    @Param('sucursalId', ParseIntPipe)
    sucursalId: number,
    @Req() request: RequestAutenticada,
  ) {
    return this.categoriasService.findAllPorSucursal(
      sucursalId,
      request.user,
    );
  }
}