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
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';

type RequestAutenticada = {
  user: UsuarioAutenticado;
};

@Controller('productos')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductosController {
  constructor(
    private readonly productosService: ProductosService,
  ) {}

  @Post()
  @Roles('ADMIN')
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
  findAll(
    @Req() request: RequestAutenticada,
  ) {
    return this.productosService.findAll(
      request.user,
    );
  }

  @Patch(':id')
  @Roles('ADMIN')
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