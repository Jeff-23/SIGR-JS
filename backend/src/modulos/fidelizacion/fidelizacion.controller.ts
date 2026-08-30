import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  ParseIntPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CanalComunicacion } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permisos } from '../auth/permisos.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';
import {
  AjustarPuntosDto,
  ConsentimientoDto,
  CrearCuponDto,
  CrearNivelDto,
  CrearPromocionDto,
} from './dto/fidelizacion.dto';
import { FidelizacionService } from './fidelizacion.service';

type RequestAutenticada = { user: UsuarioAutenticado };
@Controller('fidelizacion')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FidelizacionController {
  constructor(private readonly service: FidelizacionService) {}
  @Post('promociones') @Permisos('CONFIGURACION_GESTIONAR') crearPromocion(
    @Body() d: CrearPromocionDto,
    @Req() r: RequestAutenticada,
  ) {
    return this.service.crearPromocion(d, r.user);
  }
  @Get('promociones') @Permisos('CONFIGURACION_VER') promociones(
    @Req() r: RequestAutenticada,
  ) {
    return this.service.listarPromociones(r.user);
  }
  @Post('cupones') @Permisos('CONFIGURACION_GESTIONAR') crearCupon(
    @Body() d: CrearCuponDto,
    @Req() r: RequestAutenticada,
  ) {
    return this.service.crearCupon(d, r.user);
  }
  @Get('cupones') @Permisos('CONFIGURACION_VER') cupones(
    @Req() r: RequestAutenticada,
  ) {
    return this.service.listarCupones(r.user);
  }
  @Post('niveles') @Permisos('CONFIGURACION_GESTIONAR') crearNivel(
    @Body() d: CrearNivelDto,
    @Req() r: RequestAutenticada,
  ) {
    return this.service.crearNivel(d, r.user);
  }
  @Get('niveles') @Permisos('CLIENTES_VER') niveles(
    @Req() r: RequestAutenticada,
  ) {
    return this.service.listarNiveles(r.user);
  }
  @Get('clientes/:id/resumen') @Permisos('CLIENTES_VER') resumen(
    @Param('id', ParseIntPipe) id: number,
    @Req() r: RequestAutenticada,
  ) {
    return this.service.resumenCliente(id, r.user);
  }
  @Put('clientes/:id/consentimientos/:canal')
  @Permisos('CLIENTES_EDITAR')
  consentimiento(
    @Param('id', ParseIntPipe) id: number,
    @Param('canal', new ParseEnumPipe(CanalComunicacion))
    canal: CanalComunicacion,
    @Body() d: ConsentimientoDto,
    @Req() r: RequestAutenticada,
  ) {
    return this.service.consentimiento(id, canal, d, r.user);
  }
  @Post('clientes/:id/puntos/ajuste')
  @Permisos('CONFIGURACION_GESTIONAR')
  ajustar(
    @Param('id', ParseIntPipe) id: number,
    @Body() d: AjustarPuntosDto,
    @Req() r: RequestAutenticada,
  ) {
    return this.service.ajustar(id, d, r.user);
  }
}
