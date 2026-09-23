import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';

import { CajasService } from './cajas.service';
import { AbrirCajaDto } from './dto/abrir-caja.dto';
import { CerrarCajaDto } from './dto/cerrar-caja.dto';
import { ListarCajasDto } from './dto/listar-cajas.dto';
import { RegistrarMovimientoCajaDto } from './dto/registrar-movimiento-caja.dto';
import { ExcluirDocumentosCierreDto } from './dto/excluir-documentos-cierre.dto';
import { PrepararFiscalizacionCierreDto } from './dto/preparar-fiscalizacion-cierre.dto';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permisos } from '../auth/permisos.decorator';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';

type RequestAutenticada = {
  user: UsuarioAutenticado;
};

@Controller('cajas')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CajasController {
  constructor(private readonly cajasService: CajasService) {}

  @Post('abrir')
  @Permisos('CAJA_ABRIR')
  abrir(
    @Body() data: AbrirCajaDto,
    @Req() request: RequestAutenticada,
    @Headers('idempotency-key') clave?: string,
  ) {
    return this.cajasService.abrir(data, request.user, clave);
  }

  @Get('abiertas')
  @Permisos('CAJA_VER')
  listarAbiertas(
    @Req() request: RequestAutenticada,
    @Query('sucursalId', new ParseIntPipe({ optional: true }))
    sucursalId?: number,
  ) {
    return this.cajasService.listarAbiertas(request.user, sucursalId);
  }

  @Get('historial')
  @Permisos('CAJA_VER')
  historial(
    @Query() filtros: ListarCajasDto,
    @Req() request: RequestAutenticada,
  ) {
    return this.cajasService.historial(filtros, request.user);
  }

  @Get(':id')
  @Permisos('CAJA_VER')
  detalle(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: RequestAutenticada,
  ) {
    return this.cajasService.detalle(id, request.user);
  }

  @Get(':id/cierre-turno/estado')
  @Permisos('CAJA_CERRAR')
  estadoCierreTurno(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: RequestAutenticada,
  ) {
    return this.cajasService.estadoCierreTurno(id, request.user);
  }

  @Post(':id/cierre-turno/preparar')
  @Permisos('CAJA_CERRAR')
  prepararCierreTurno(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: RequestAutenticada,
  ) {
    return this.cajasService.prepararCierreTurno(id, request.user);
  }

  @Get(':id/cierre-turno/excel')
  @Permisos('CAJA_CERRAR')
  async descargarExcelCierreTurno(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: RequestAutenticada,
    @Res() response: Response,
  ) {
    const archivo = await this.cajasService.descargarExcelCierreTurno(
      id,
      request.user,
    );
    response.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${archivo.nombre}"`,
    );
    response.send(archivo.contenido);
  }

  @Get(':id/cierre-turno/pdf')
  @Permisos('CAJA_CERRAR')
  async descargarPdfCierreTurno(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: RequestAutenticada,
    @Res() response: Response,
  ) {
    const archivo = await this.cajasService.descargarPdfCierreTurno(
      id,
      request.user,
    );
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${archivo.nombre}"`,
    );
    response.send(archivo.contenido);
  }

  @Get(':id/cierre-turno/exclusiones')
  @Permisos('DOCUMENTOS_INTERNOS_EXCLUIR_CIERRE')
  listarExclusionesCierre(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: RequestAutenticada,
  ) {
    return this.cajasService.listarExclusionesCierre(id, request.user);
  }

  @Post(':id/cierre-turno/exclusiones')
  @Permisos('DOCUMENTOS_INTERNOS_EXCLUIR_CIERRE')
  excluirDocumentosCierre(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: ExcluirDocumentosCierreDto,
    @Req() request: RequestAutenticada,
  ) {
    return this.cajasService.excluirDocumentosCierre(id, data, request.user);
  }

  @Get(':id/cierre-turno/fiscalizacion')
  @Permisos('CAJA_CERRAR', 'FACTURAS_EMITIR')
  universoFiscalCierre(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: RequestAutenticada,
  ) {
    return this.cajasService.universoFiscalCierre(id, request.user);
  }

  @Post(':id/cierre-turno/fiscalizacion/preparar')
  @Permisos('CAJA_CERRAR', 'FACTURAS_EMITIR')
  prepararFiscalizacionCierre(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: PrepararFiscalizacionCierreDto,
    @Req() request: RequestAutenticada,
  ) {
    return this.cajasService.prepararFiscalizacionCierre(
      id,
      data,
      request.user,
    );
  }

  @Post(':id/movimientos')
  @Permisos('CAJA_MOVIMIENTOS')
  registrarMovimiento(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: RegistrarMovimientoCajaDto,
    @Req() request: RequestAutenticada,
    @Headers('idempotency-key') clave?: string,
  ) {
    return this.cajasService.registrarMovimiento(id, data, request.user, clave);
  }

  @Get(':id/cierre-turno/tirilla')
  @Permisos('CAJA_CERRAR')
  async descargarTirillaCierre(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: RequestAutenticada,
    @Res() response: Response,
  ) {
    const archivo = await this.cajasService.descargarTirillaCierre(
      id,
      request.user,
    );

    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${archivo.nombre}"`,
    );
    response.send(archivo.contenido);
  }
  @Post(':id/cerrar')
  @Permisos('CAJA_CERRAR')
  cerrar(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: CerrarCajaDto,
    @Req() request: RequestAutenticada,
    @Headers('idempotency-key') clave?: string,
  ) {
    return this.cajasService.cerrar(id, data, request.user, clave);
  }
}
