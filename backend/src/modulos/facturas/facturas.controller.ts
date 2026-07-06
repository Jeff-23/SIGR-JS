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
  @Roles(1, 2) // Admin y Cajero
  create(@Body() createFacturaDto: CreateFacturaDto) {
    return this.facturasService.create(createFacturaDto);
  }

  // --- 1. RUTA CORTE DE CAJA ---
  // Importante: Debe ir ANTES de las rutas con :id para que NestJS no confunda "corte-caja" con un ID
  @Get('corte-caja')
  @Roles(1) // Solo Admin
  obtenerCorteCaja(@Query('inicio') inicio?: string, @Query('fin') fin?: string) {
    return this.facturasService.obtenerCorteCaja(inicio, fin);
  }

  // --- 2. RUTA SIMULACIÓN DIAN ---
  @Post(':id/emitir-dian')
  @Roles(1, 2) // Admin y Cajero
  emitirDian(@Param('id', ParseIntPipe) id: number) {
    return this.facturasService.emitirDian(id);
  }
}