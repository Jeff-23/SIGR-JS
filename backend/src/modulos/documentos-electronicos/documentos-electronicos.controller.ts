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

type RequestAutenticada = {
  user: UsuarioAutenticado;
};

@Controller('documentos-electronicos')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DocumentosElectronicosController {
  constructor(
    private readonly documentosService: DocumentosElectronicosService,
  ) {}

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
