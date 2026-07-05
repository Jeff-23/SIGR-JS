import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { RecetasService } from './recetas.service';
import { CreateRecetaDto } from './dto/create-receta.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('recetas')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RecetasController {
  constructor(private readonly recetasService: RecetasService) {}

  @Post()
  @Roles(1) // Solo Admin
  create(@Body() createRecetaDto: CreateRecetaDto) {
    return this.recetasService.create(createRecetaDto);
  }
}