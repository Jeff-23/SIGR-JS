import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { PedidosService } from './pedidos.service';
import { CreatePedidoDto } from './dto/create-pedido.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('pedidos')
@UseGuards(JwtAuthGuard) // Protegido, pero sin @Roles(1) para que los meseros puedan acceder
export class PedidosController {
  constructor(private readonly pedidosService: PedidosService) {}

  @Post()
  create(@Body() createPedidoDto: CreatePedidoDto) {
    return this.pedidosService.create(createPedidoDto);
  }
}