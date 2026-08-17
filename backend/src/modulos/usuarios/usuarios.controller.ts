import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { UsuariosService } from './usuarios.service';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permisos } from '../auth/permisos.decorator';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';

type RequestAutenticada = {
  user: UsuarioAutenticado;
};

@Controller('usuarios')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UsuariosController {
  constructor(
    private readonly usuariosService: UsuariosService,
  ) {}

  @Post()
  @Permisos('USUARIOS_CREAR')
  create(
    @Body() createUsuarioDto: CreateUsuarioDto,
    @Req() request: RequestAutenticada,
  ) {
    return this.usuariosService.create(
      createUsuarioDto,
      request.user,
    );
  }

  @Get()
  @Permisos('USUARIOS_VER')
  findAll(
    @Req() request: RequestAutenticada,
  ) {
    return this.usuariosService.findAll(
      request.user,
    );
  }

  @Get(':id')
  @Permisos('USUARIOS_VER')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: RequestAutenticada,
  ) {
    return this.usuariosService.findOne(
      id,
      request.user,
    );
  }

  @Patch(':id')
  @Permisos('USUARIOS_EDITAR')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateUsuarioDto: UpdateUsuarioDto,
    @Req() request: RequestAutenticada,
  ) {
    return this.usuariosService.update(
      id,
      updateUsuarioDto,
      request.user,
    );
  }

  @Delete(':id')
  @Permisos('USUARIOS_DESACTIVAR')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: RequestAutenticada,
  ) {
    return this.usuariosService.remove(
      id,
      request.user,
    );
  }
}