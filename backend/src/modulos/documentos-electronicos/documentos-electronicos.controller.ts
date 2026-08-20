import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { DocumentosElectronicosService } from './documentos-electronicos.service';

import { PrepararDocumentosDto } from './dto/preparar-documentos.dto';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';

import { PermissionsGuard } from '../auth/permissions.guard';

import { Permisos } from '../auth/permisos.decorator';

import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';
import { NumerarDocumentoDto } from './dto/numerar-documento.dto';
import { ProcesarColaFiscalDto } from './dto/procesar-cola-fiscal.dto';

type RequestAutenticada = {
  user: UsuarioAutenticado;
};

@Controller('documentos-electronicos')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DocumentosElectronicosController {
  constructor(
    private readonly documentosService: DocumentosElectronicosService,
  ) {}

  @Post('procesar-cola')
  @Permisos('FACTURAS_EMITIR')
  procesarCola(
    @Body() data: ProcesarColaFiscalDto,
    @Req() request: RequestAutenticada,
  ) {
    return this.documentosService.procesarPendientes(
      data.limite ?? 20,
      request.user,
    );
  }

  /*
   * Preparar NO significa enviar.
   *
   * Por ahora reutilizamos FACTURAS_EMITIR.
   * Más adelante podemos separar permisos
   * específicos del proveedor electrónico.
   */
  @Post('preparar')
  @Permisos('FACTURAS_EMITIR')
  preparar(
    @Body()
    data: PrepararDocumentosDto,

    @Req()
    request: RequestAutenticada,
  ) {
    return this.documentosService.preparar(data.facturaIds, request.user);
  }

  @Post(':id/numerar')
  @Permisos('FACTURAS_EMITIR')
  numerar(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: NumerarDocumentoDto,
    @Req() request: RequestAutenticada,
  ) {
    return this.documentosService.numerar(id, data.resolucionId, request.user);
  }

  @Post(':id/encolar')
  @Permisos('FACTURAS_EMITIR')
  encolar(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: RequestAutenticada,
  ) {
    return this.documentosService.encolar(id, request.user);
  }

  @Post(':id/consultar-estado')
  @Permisos('FACTURAS_EMITIR')
  consultarEstado(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: RequestAutenticada,
  ) {
    return this.documentosService.consultarEstado(id, request.user);
  }

  @Get()
  @Permisos('FACTURAS_VER')
  findAll(
    @Req()
    request: RequestAutenticada,
  ) {
    return this.documentosService.findAll(request.user);
  }

  @Get(':id')
  @Permisos('FACTURAS_VER')
  findOne(
    @Param('id', ParseIntPipe)
    id: number,

    @Req()
    request: RequestAutenticada,
  ) {
    return this.documentosService.findOne(id, request.user);
  }
}
