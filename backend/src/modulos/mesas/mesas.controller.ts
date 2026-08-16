import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common'; // 👈 ¡Ahora sí tiene Get!
import { MesasService } from './mesas.service';
import { CreateMesaDto } from './dto/create-mesa.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('mesas')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MesasController {
  constructor(private readonly mesasService: MesasService) {}

  @Post()
  @Roles('ADMIN')
  create(@Body() createMesaDto: CreateMesaDto) {
    return this.mesasService.create(createMesaDto);
  }

  @Get() // Permite a cualquier usuario autenticado ver el salón
  findAll() {
    return this.mesasService.findAll();
  }
}
