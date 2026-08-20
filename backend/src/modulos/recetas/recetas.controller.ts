import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';

import { RecetasService } from './recetas.service';
import { CreateRecetaDto } from './dto/create-receta.dto';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permisos } from '../auth/permisos.decorator';
import { CapabilitiesGuard } from '../auth/capabilities.guard';
import { Capacidades } from '../auth/capacidades.decorator';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';

type RequestAutenticada = {
  user: UsuarioAutenticado;
};

@Controller('recetas')
@UseGuards(JwtAuthGuard, PermissionsGuard, CapabilitiesGuard)
@Capacidades('RECETAS')
export class RecetasController {
  constructor(private readonly recetasService: RecetasService) {}

  @Post()
  @Permisos('RECETAS_CREAR')
  create(
    @Body() createRecetaDto: CreateRecetaDto,
    @Req() request: RequestAutenticada,
  ) {
    return this.recetasService.create(createRecetaDto, request.user);
  }
}
