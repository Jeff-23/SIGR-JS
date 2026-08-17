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
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';

type RequestAutenticada = {
  user: UsuarioAutenticado;
};

@Controller('sucursales')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class SucursalesController {
  constructor(
    private readonly sucursalesService: SucursalesService,
  ) {}

  @Post()
  create(
    @Body() createSucursalDto: CreateSucursalDto,
    @Req() request: RequestAutenticada,
  ) {
    return this.sucursalesService.create(
      createSucursalDto,
      request.user,
    );
  }

  @Get()
  findAll(
    @Req() request: RequestAutenticada,
  ) {
    return this.sucursalesService.findAll(
      request.user,
    );
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: RequestAutenticada,
  ) {
    return this.sucursalesService.findOne(
      id,
      request.user,
    );
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateSucursalDto: UpdateSucursalDto,
    @Req() request: RequestAutenticada,
  ) {
    return this.sucursalesService.update(
      id,
      updateSucursalDto,
      request.user,
    );
  }

  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: RequestAutenticada,
  ) {
    return this.sucursalesService.remove(
      id,
      request.user,
    );
  }
}