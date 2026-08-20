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

import { SucursalesService } from './sucursales.service';
import { CreateSucursalDto } from './dto/create-sucursal.dto';
import { UpdateSucursalDto } from './dto/update-sucursal.dto';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permisos } from '../auth/permisos.decorator';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';

type RequestAutenticada = {
  user: UsuarioAutenticado;
};

@Controller('sucursales')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SucursalesController {
  constructor(private readonly sucursalesService: SucursalesService) {}

  @Post()
  @Permisos('SUCURSALES_CREAR')
  create(
    @Body() createSucursalDto: CreateSucursalDto,
    @Req() request: RequestAutenticada,
  ) {
    return this.sucursalesService.create(createSucursalDto, request.user);
  }

  @Get()
  @Permisos('SUCURSALES_VER')
  findAll(@Req() request: RequestAutenticada) {
    return this.sucursalesService.findAll(request.user);
  }

  @Get(':id')
  @Permisos('SUCURSALES_VER')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: RequestAutenticada,
  ) {
    return this.sucursalesService.findOne(id, request.user);
  }

  @Patch(':id')
  @Permisos('SUCURSALES_EDITAR')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateSucursalDto: UpdateSucursalDto,
    @Req() request: RequestAutenticada,
  ) {
    return this.sucursalesService.update(id, updateSucursalDto, request.user);
  }

  @Delete(':id')
  @Permisos('SUCURSALES_EDITAR')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: RequestAutenticada,
  ) {
    return this.sucursalesService.remove(id, request.user);
  }
}
