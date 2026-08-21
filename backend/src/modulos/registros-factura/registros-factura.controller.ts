import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permisos } from '../auth/permisos.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';
import { ActualizarRegistroFacturaDto } from './dto/actualizar-registro-factura.dto';
import { CrearRegistroFacturaDto } from './dto/crear-registro-factura.dto';
import { ListarRegistrosFacturaDto } from './dto/listar-registros-factura.dto';
import { RegistrosFacturaService } from './registros-factura.service';

type RequestAutenticada = { user: UsuarioAutenticado };

@Controller('registros-factura')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RegistrosFacturaController {
  constructor(private readonly service: RegistrosFacturaService) {}

  @Post()
  @Permisos('REGISTROS_FACTURA_CREAR')
  crear(
    @Body() data: CrearRegistroFacturaDto,
    @Headers('idempotency-key') clave: string | undefined,
    @Req() request: RequestAutenticada,
  ) {
    return this.service.crear(data, clave, request.user);
  }

  @Get()
  @Permisos('REGISTROS_FACTURA_VER')
  listar(
    @Query() filtros: ListarRegistrosFacturaDto,
    @Req() request: RequestAutenticada,
  ) {
    return this.service.listar(filtros, request.user);
  }

  @Get('exportar.csv')
  @Permisos('REGISTROS_FACTURA_EXPORTAR')
  async exportar(
    @Query() filtros: ListarRegistrosFacturaDto,
    @Req() request: RequestAutenticada,
    @Res() response: Response,
  ) {
    const csv = await this.service.exportarCsv(filtros, request.user);
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      'attachment; filename="registros-factura.csv"',
    );
    response.send(csv);
  }

  @Get(':id')
  @Permisos('REGISTROS_FACTURA_VER')
  obtener(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: RequestAutenticada,
  ) {
    return this.service.obtener(id, request.user);
  }

  @Patch(':id')
  @Permisos('REGISTROS_FACTURA_CREAR')
  actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: ActualizarRegistroFacturaDto,
    @Req() request: RequestAutenticada,
  ) {
    return this.service.actualizar(id, data, request.user);
  }

  @Delete(':id')
  @Permisos('REGISTROS_FACTURA_ELIMINAR')
  eliminar(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: RequestAutenticada,
  ) {
    return this.service.eliminar(id, request.user);
  }
}
