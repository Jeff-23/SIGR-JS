import { Controller, Post, Get, Patch, Body, Param, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ProductosService } from './productos.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('productos')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductosController {
  constructor(private readonly productosService: ProductosService) {}

  @Post()
  @Roles(1)
  create(@Body() createProductoDto: any) {
    return this.productosService.create(createProductoDto);
  }

  @Get()
  findAll() {
    return this.productosService.findAll();
  }

  @Patch(':id')
  @Roles(1) // Solo Admin puede cambiar el precio de la carta
  update(@Param('id', ParseIntPipe) id: number, @Body() updateData: any) {
    return this.productosService.update(id, updateData);
  }
}