import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { MetodosPagoService } from './metodos-pago.service';
import { CreateMetodoPagoDto } from './dto/create-metodo-pago.dto';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';

type RequestAutenticada = {
  user: UsuarioAutenticado;
};

@Controller('metodos-pago')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MetodosPagoController {
  constructor(
    private readonly metodosPagoService: MetodosPagoService,
  ) {}

  @Post()
  @Roles('ADMIN')
  create(
    @Body() createMetodoPagoDto: CreateMetodoPagoDto,
    @Req() request: RequestAutenticada,
  ) {
    return this.metodosPagoService.create(
      createMetodoPagoDto,
      request.user,
    );
  }

  @Get()
  findAll() {
    return this.metodosPagoService.findAll();
  }
}