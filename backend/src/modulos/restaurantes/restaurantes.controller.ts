import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { RestaurantesService } from './restaurantes.service';
import { CreateRestauranteDto } from './dto/create-restaurante.dto';
import { UpdateRestauranteDto } from './dto/update-restaurante.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('restaurantes')
@UseGuards(JwtAuthGuard, RolesGuard) // Protegemos la ruta entera con el token
export class RestaurantesController {
  constructor(private readonly restaurantesService: RestaurantesService) {}

  @Post()
  @Roles(1) // Candado extra: Solo el Admin puede crear sedes maestras
  create(@Body() createRestauranteDto: CreateRestauranteDto) {
    return this.restaurantesService.create(createRestauranteDto);
  }

  @Get()
  findAll() {
    return this.restaurantesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.restaurantesService.findOne(+id);
  }

  @Patch(':id')
  @Roles(1)
  update(@Param('id') id: string, @Body() updateRestauranteDto: UpdateRestauranteDto) {
    return this.restaurantesService.update(+id, updateRestauranteDto);
  }

  @Delete(':id')
  @Roles(1)
  remove(@Param('id') id: string) {
    return this.restaurantesService.remove(+id);
  }
}