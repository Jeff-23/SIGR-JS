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
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';

type RequestAutenticada = {
  user: UsuarioAutenticado;
};

@Controller('articulos')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ArticulosController {
  constructor(
    private readonly articulosService: ArticulosService,
  ) {}

  @Post()
  @Roles('ADMIN')
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
  findAll(
    @Req() request: RequestAutenticada,
  ) {
    return this.articulosService.findAll(
      request.user,
    );
  }

  @Get(':id')
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
  @Roles('ADMIN')
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