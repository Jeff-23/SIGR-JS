import { Controller, Post, Body, UseGuards, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { FacturasService } from './facturas.service';
import { CreateFacturaDto } from './dto/create-factura.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('facturas')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FacturasController {
  constructor(private readonly facturasService: FacturasService) {}

  @Post()
 @Roles('ADMIN', 'CAJERO')
  create(@Body() createFacturaDto: CreateFacturaDto) {
    return this.facturasService.create(createFacturaDto);
  }

  // --- 1. RUTA CORTE DE CAJA ---
  // Importante: Debe ir ANTES de las rutas con :id para que NestJS no confunda "corte-caja" con un ID
  @Get('corte-caja')
  @Roles('ADMIN')
  obtenerCorteCaja(@Query('inicio') inicio?: string, @Query('fin') fin?: string) {
    return this.facturasService.obtenerCorteCaja(inicio, fin);
  }

  // --- 2. RUTA SIMULACIÓN DIAN ---
  @Post(':id/emitir-dian')
  @Roles('ADMIN', 'CAJERO')
  emitirDian(@Param('id', ParseIntPipe) id: number) {
    return this.facturasService.emitirDian(id);
  }
}