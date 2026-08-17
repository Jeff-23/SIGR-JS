import {
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { RecetasService } from './recetas.service';
import { CreateRecetaDto } from './dto/create-receta.dto';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';

type RequestAutenticada = {
  user: UsuarioAutenticado;
};

@Controller('recetas')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RecetasController {
  constructor(
    private readonly recetasService: RecetasService,
  ) {}

  @Post()
  @Roles('ADMIN')
  create(
    @Body() createRecetaDto: CreateRecetaDto,
    @Req() request: RequestAutenticada,
  ) {
    return this.recetasService.create(
      createRecetaDto,
      request.user,
    );
  }
}