import { Controller, Post, Get, Patch, Body, Param, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ArticulosService } from './articulos.service';
import { CreateArticuloDto } from './dto/create-articulo.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('articulos')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ArticulosController {
  constructor(private readonly articulosService: ArticulosService) {}

  @Post()
  @Roles(1) // Solo Admin crea
  create(@Body() createArticuloDto: CreateArticuloDto) {
    return this.articulosService.create(createArticuloDto);
  }

  @Get()
  findAll() {
    return this.articulosService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.articulosService.findOne(id);
  }

  // AQUÍ ESTÁ LA RUTA QUE FALTABA
  @Patch(':id')
  @Roles(1) 
  update(@Param('id', ParseIntPipe) id: number, @Body() updateData: Partial<CreateArticuloDto>) {
    return this.articulosService.update(id, updateData);
  }
}