import { Controller, Get, Post, Body, Param, UseGuards, ParseIntPipe } from '@nestjs/common';
import { CategoriasService } from './categorias.service';
import { CreateCategoriaDto } from './dto/create-categoria.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('categorias')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CategoriasController {
  constructor(private readonly categoriasService: CategoriasService) {}

  @Post()
  @Roles(1) // Solo Admin
  create(@Body() createCategoriaDto: CreateCategoriaDto) {
    return this.categoriasService.create(createCategoriaDto);
  }

  @Get('sucursal/:sucursalId')
  findAllPorSucursal(@Param('sucursalId', ParseIntPipe) sucursalId: number) {
    return this.categoriasService.findAllPorSucursal(sucursalId);
  }
}