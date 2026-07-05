import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { MetodosPagoService } from './metodos-pago.service';
import { CreateMetodoPagoDto } from './dto/create-metodo-pago.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('metodos-pago')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MetodosPagoController {
  constructor(private readonly metodosPagoService: MetodosPagoService) {}

  @Post()
  @Roles(1) // Solo admin crea métodos de pago
  create(@Body() createMetodoPagoDto: CreateMetodoPagoDto) {
    return this.metodosPagoService.create(createMetodoPagoDto);
  }

  @Get()
  findAll() {
    return this.metodosPagoService.findAll(); // Todos pueden verlos al momento de pagar
  }
}