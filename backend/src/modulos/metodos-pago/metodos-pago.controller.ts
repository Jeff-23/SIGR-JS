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
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permisos } from '../auth/permisos.decorator';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';

type RequestAutenticada = {
  user: UsuarioAutenticado;
};

@Controller('metodos-pago')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MetodosPagoController {
  constructor(
    private readonly metodosPagoService: MetodosPagoService,
  ) {}

  @Post()
  @Permisos('METODOS_PAGO_GESTIONAR')
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
  @Permisos('METODOS_PAGO_VER')
  findAll() {
    return this.metodosPagoService.findAll();
  }
}

