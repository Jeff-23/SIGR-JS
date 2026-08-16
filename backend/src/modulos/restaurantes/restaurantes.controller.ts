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

import { RestaurantesService } from './restaurantes.service';
import { CreateRestauranteDto } from './dto/create-restaurante.dto';
import { UpdateRestauranteDto } from './dto/update-restaurante.dto';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';

type RequestAutenticada = {
  user: UsuarioAutenticado;
};

@Controller('restaurantes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class RestaurantesController {
  constructor(
    private readonly restaurantesService: RestaurantesService,
  ) {}

  @Post()
  create(
    @Body() createRestauranteDto: CreateRestauranteDto,
    @Req() request: RequestAutenticada,
  ) {
    return this.restaurantesService.create(
      createRestauranteDto,
      request.user,
    );
  }

  @Get()
  findAll(
    @Req() request: RequestAutenticada,
  ) {
    return this.restaurantesService.findAll(
      request.user,
    );
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: RequestAutenticada,
  ) {
    return this.restaurantesService.findOne(
      id,
      request.user,
    );
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateRestauranteDto: UpdateRestauranteDto,
    @Req() request: RequestAutenticada,
  ) {
    return this.restaurantesService.update(
      id,
      updateRestauranteDto,
      request.user,
    );
  }

  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: RequestAutenticada,
  ) {
    return this.restaurantesService.remove(
      id,
      request.user,
    );
  }
}