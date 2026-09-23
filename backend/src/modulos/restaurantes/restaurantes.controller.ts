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

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import {
  construirContextoAuditoria,
  RequestAuditable,
} from '../auditoria/auditoria-contexto';
import { AuditoriaDetallada } from '../auditoria/auditoria-detallada.decorator';
import { CreateRestauranteDto } from './dto/create-restaurante.dto';
import { DesactivarRestauranteDto } from './dto/desactivar-restaurante.dto';
import { UpdateRestauranteDto } from './dto/update-restaurante.dto';
import { RestaurantesService } from './restaurantes.service';

@Controller('restaurantes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPERADMIN')
@AuditoriaDetallada()
export class RestaurantesController {
  constructor(private readonly restaurantesService: RestaurantesService) {}

  @Post()
  create(
    @Body() createRestauranteDto: CreateRestauranteDto,
    @Req() request: RequestAuditable,
  ) {
    return this.restaurantesService.create(
      createRestauranteDto,
      request.user,
      construirContextoAuditoria(request),
    );
  }

  @Get()
  findAll(@Req() request: RequestAuditable) {
    return this.restaurantesService.findAll(request.user);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: RequestAuditable,
  ) {
    return this.restaurantesService.findOne(id, request.user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateRestauranteDto: UpdateRestauranteDto,
    @Req() request: RequestAuditable,
  ) {
    return this.restaurantesService.update(
      id,
      updateRestauranteDto,
      request.user,
      construirContextoAuditoria(request),
    );
  }

  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: DesactivarRestauranteDto,
    @Req() request: RequestAuditable,
  ) {
    return this.restaurantesService.remove(
      id,
      data.password,
      request.user,
      construirContextoAuditoria(request),
    );
  }
}
