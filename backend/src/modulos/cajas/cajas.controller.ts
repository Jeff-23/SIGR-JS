import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { CajasService } from './cajas.service';
import { AbrirCajaDto } from './dto/abrir-caja.dto';
import { CerrarCajaDto } from './dto/cerrar-caja.dto';
import { ListarCajasDto } from './dto/listar-cajas.dto';
import { RegistrarMovimientoCajaDto } from './dto/registrar-movimiento-caja.dto';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permisos } from '../auth/permisos.decorator';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';

type RequestAutenticada = {
  user: UsuarioAutenticado;
};

@Controller('cajas')
@UseGuards(
  JwtAuthGuard,
  PermissionsGuard,
)
export class CajasController {
  constructor(
    private readonly cajasService: CajasService,
  ) {}

  @Post('abrir')
  @Permisos('CAJA_ABRIR')
  abrir(
    @Body() data: AbrirCajaDto,
    @Req() request: RequestAutenticada,
  ) {
    return this.cajasService.abrir(
      data,
      request.user,
    );
  }

  @Get('abiertas')
  @Permisos('CAJA_VER')
  listarAbiertas(
    @Req() request: RequestAutenticada,
  ) {
    return this.cajasService.listarAbiertas(
      request.user,
    );
  }

  @Get('historial')
  @Permisos('CAJA_VER')
  historial(
    @Query() filtros: ListarCajasDto,
    @Req() request: RequestAutenticada,
  ) {
    return this.cajasService.historial(
      filtros,
      request.user,
    );
  }

  @Get(':id')
  @Permisos('CAJA_VER')
  detalle(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: RequestAutenticada,
  ) {
    return this.cajasService.detalle(
      id,
      request.user,
    );
  }

  @Post(':id/movimientos')
  @Permisos('CAJA_MOVIMIENTOS')
  registrarMovimiento(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: RegistrarMovimientoCajaDto,
    @Req() request: RequestAutenticada,
  ) {
    return this.cajasService.registrarMovimiento(
      id,
      data,
      request.user,
    );
  }

  @Post(':id/cerrar')
  @Permisos('CAJA_CERRAR')
  cerrar(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: CerrarCajaDto,
    @Req() request: RequestAutenticada,
  ) {
    return this.cajasService.cerrar(
      id,
      data,
      request.user,
    );
  }
}
