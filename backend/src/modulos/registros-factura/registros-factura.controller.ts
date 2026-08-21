import {
  Body,
  BadRequestException,
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
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permisos } from '../auth/permisos.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';
import { ActualizarRegistroFacturaDto } from './dto/actualizar-registro-factura.dto';
import { CrearRegistroFacturaDto } from './dto/crear-registro-factura.dto';
import { ListarRegistrosFacturaDto } from './dto/listar-registros-factura.dto';
import { RegistrosFacturaService } from './registros-factura.service';
import {
  ArchivoSoporte,
  SoportesRegistroService,
} from './soportes-registro.service';

type RequestAutenticada = { user: UsuarioAutenticado };

@Controller('registros-factura')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RegistrosFacturaController {
  constructor(
    private readonly service: RegistrosFacturaService,
    private readonly soportes: SoportesRegistroService,
  ) {}

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

  @Post(':id/soporte')
  @Permisos('REGISTROS_FACTURA_CREAR')
  @UseInterceptors(
    FileInterceptor('archivo', {
      limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    }),
  )
  async subirSoporte(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() archivo: ArchivoSoporte | undefined,
    @Req() request: RequestAutenticada,
  ) {
    if (!archivo) throw new BadRequestException('Debe adjuntar un archivo');
    const registro = await this.service.obtener(id, request.user);
    const referencia = await this.soportes.guardar(archivo);
    try {
      const actualizado = await this.service.actualizarReferenciaSoporte(
        id,
        referencia,
        request.user,
      );
      await this.soportes.eliminar(registro.soporteArchivoRef);
      return actualizado;
    } catch (error) {
      await this.soportes.eliminar(referencia);
      throw error;
    }
  }

  @Get(':id/soporte')
  @Permisos('REGISTROS_FACTURA_VER')
  async descargarSoporte(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: RequestAutenticada,
    @Res({ passthrough: true }) response: Response,
  ) {
    const registro = await this.service.obtener(id, request.user);
    const archivo = await this.soportes.leer(registro.soporteArchivoRef);
    response.setHeader('Content-Type', archivo.tipo);
    response.setHeader(
      'Content-Disposition',
      `inline; filename="${archivo.nombre}"`,
    );
    return new StreamableFile(archivo.contenido);
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
  async eliminar(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: RequestAutenticada,
  ) {
    const registro = await this.service.obtener(id, request.user);
    const resultado = await this.service.eliminar(id, request.user);
    await this.soportes.eliminar(registro.soporteArchivoRef);
    return resultado;
  }
}
