import { Controller, Get, Post, Body, Param, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ZonasService } from './zonas.service';
import { CreateZonaDto } from './dto/create-zona.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('zonas')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ZonasController {
  constructor(private readonly zonasService: ZonasService) {}

  @Post()
  @Roles(1) // Solo Admin
  create(@Body() createZonaDto: CreateZonaDto) {
    return this.zonasService.create(createZonaDto);
  }

  @Get('sucursal/:sucursalId')
  findAllPorSucursal(@Param('sucursalId', ParseIntPipe) sucursalId: number) {
    return this.zonasService.findAllPorSucursal(sucursalId);
  }
}
