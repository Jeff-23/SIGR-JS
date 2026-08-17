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

import { ProductosService } from './productos.service';
import { CreateProductoDto } from './dto/create-producto.dto';
import { UpdateProductoDto } from './dto/update-producto.dto';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permisos } from '../auth/permisos.decorator';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';

type RequestAutenticada = {
  user: UsuarioAutenticado;
};

@Controller('productos')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProductosController {
  constructor(
    private readonly productosService: ProductosService,
  ) {}

  @Post()
  @Permisos('PRODUCTOS_CREAR')
  create(
    @Body() createProductoDto: CreateProductoDto,
    @Req() request: RequestAutenticada,
  ) {
    return this.productosService.create(
      createProductoDto,
      request.user,
    );
  }

  @Get()
  @Permisos('PRODUCTOS_VER')
  findAll(
    @Req() request: RequestAutenticada,
  ) {
    return this.productosService.findAll(
      request.user,
    );
  }

  @Patch(':id')
  @Permisos('PRODUCTOS_EDITAR')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateData: UpdateProductoDto,
    @Req() request: RequestAutenticada,
  ) {
    return this.productosService.update(
      id,
      updateData,
      request.user,
    );
  }
}

