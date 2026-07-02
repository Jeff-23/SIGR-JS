import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, ParseIntPipe } from '@nestjs/common';
import { SucursalesService } from './sucursales.service';
import { CreateSucursalDto } from './dto/create-sucursal.dto';
import { UpdateSucursalDto } from './dto/update-sucursal.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('sucursales')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SucursalesController {
  constructor(private readonly sucursalesService: SucursalesService) {}

  @Post()
  @Roles(1) // Bloqueo: Solo administradores maestros crean sucursales
  create(@Body() createSucursalDto: CreateSucursalDto) {
    return this.sucursalesService.create(createSucursalDto);
  }

  @Get()
  findAll() {
    return this.sucursalesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.sucursalesService.findOne(id);
  }

  @Patch(':id')
  @Roles(1)
  update(@Param('id', ParseIntPipe) id: number, @Body() updateSucursalDto: UpdateSucursalDto) {
    return this.sucursalesService.update(id, updateSucursalDto);
  }

  @Delete(':id')
  @Roles(1)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.sucursalesService.remove(id);
  }
}