import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permisos } from '../auth/permisos.decorator';
import {
  construirContextoAuditoria,
  RequestAuditable,
} from '../auditoria/auditoria-contexto';
import { AuditoriaDetallada } from '../auditoria/auditoria-detallada.decorator';
import { ActualizarMetodoPagoRestauranteDto } from './dto/actualizar-metodo-pago-restaurante.dto';
import { CreateMetodoPagoDto } from './dto/create-metodo-pago.dto';
import { MetodosPagoService } from './metodos-pago.service';

@Controller('metodos-pago')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@AuditoriaDetallada()
export class MetodosPagoController {
  constructor(private readonly metodosPagoService: MetodosPagoService) {}

  @Post()
  @Permisos('METODOS_PAGO_GESTIONAR')
  create(
    @Body() createMetodoPagoDto: CreateMetodoPagoDto,
    @Req() request: RequestAuditable,
  ) {
    return this.metodosPagoService.create(createMetodoPagoDto, request.user);
  }

  @Get()
  @Permisos('METODOS_PAGO_VER')
  findAll(@Req() request: RequestAuditable) {
    return this.metodosPagoService.findAll(request.user);
  }

  @Patch(':id/configuracion')
  @Permisos('METODOS_PAGO_GESTIONAR')
  actualizarConfiguracion(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: ActualizarMetodoPagoRestauranteDto,
    @Req() request: RequestAuditable,
  ) {
    return this.metodosPagoService.actualizarConfiguracionRestaurante(
      id,
      data,
      request.user,
      construirContextoAuditoria(request),
    );
  }
}
