import {
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { PedidosService } from './pedidos.service';
import { CreatePedidoDto } from './dto/create-pedido.dto';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';

type RequestAutenticada = {
  user: UsuarioAutenticado;
};

@Controller('pedidos')
@UseGuards(JwtAuthGuard)
export class PedidosController {
  constructor(
    private readonly pedidosService: PedidosService,
  ) {}

  @Post()
  create(
    @Body() createPedidoDto: CreatePedidoDto,
    @Req() request: RequestAutenticada,
  ) {
    return this.pedidosService.create(
      createPedidoDto,
      request.user,
    );
  }
}