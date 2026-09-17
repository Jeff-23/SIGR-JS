import {
  Body,
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';

import { ProductosService } from './productos.service';
import { CreateProductoDto } from './dto/create-producto.dto';
import { UpdateProductoDto } from './dto/update-producto.dto';
import { GestionarModificadoresDto } from './dto/gestionar-modificadores.dto';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permisos } from '../auth/permisos.decorator';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ArchivoImagenProducto,
  ImagenesProductoService,
} from './imagenes-producto.service';

type RequestAutenticada = {
  user: UsuarioAutenticado;
};

@Controller('productos')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProductosController {
  constructor(
    private readonly productosService: ProductosService,
    private readonly imagenesProducto: ImagenesProductoService,
  ) {}

  @Post()
  @Permisos('PRODUCTOS_CREAR')
  create(
    @Body() createProductoDto: CreateProductoDto,
    @Req() request: RequestAutenticada,
  ) {
    return this.productosService.create(createProductoDto, request.user);
  }

  @Get()
  @Permisos('PRODUCTOS_VER')
  findAll(
    @Req() request: RequestAutenticada,
    @Query('sucursalId', new ParseIntPipe({ optional: true }))
    sucursalId?: number,
  ) {
    return this.productosService.findAll(request.user, sucursalId);
  }

  @Post(':id/imagen')
  @Permisos('PRODUCTOS_EDITAR')
  @UseInterceptors(
    FileInterceptor('archivo', {
      limits: { fileSize: 12 * 1024 * 1024, files: 1 },
    }),
  )
  subirImagen(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() archivo: ArchivoImagenProducto | undefined,
    @Body() body: { focoX?: string; focoY?: string; zoom?: string },
    @Req() request: RequestAutenticada,
  ) {
    if (!archivo) throw new BadRequestException('Debe seleccionar una foto');
    const numero = (valor: string | undefined) =>
      valor === undefined || valor === '' ? undefined : Number(valor);
    return this.imagenesProducto.guardar(
      id,
      archivo,
      {
        focoX: numero(body.focoX),
        focoY: numero(body.focoY),
        zoom: numero(body.zoom),
      },
      request.user,
    );
  }

  @Delete(':id/imagen')
  @Permisos('PRODUCTOS_EDITAR')
  eliminarImagen(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: RequestAutenticada,
  ) {
    return this.imagenesProducto.eliminar(id, request.user);
  }

  @Post(':id/modificadores')
  @Permisos('PRODUCTOS_EDITAR')
  gestionarModificadores(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: GestionarModificadoresDto,
    @Req() request: RequestAutenticada,
  ) {
    return this.productosService.gestionarModificadores(
      id,
      data.modificadores,
      request.user,
    );
  }

  @Patch(':id')
  @Permisos('PRODUCTOS_EDITAR')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateData: UpdateProductoDto,
    @Req() request: RequestAutenticada,
  ) {
    return this.productosService.update(id, updateData, request.user);
  }
}
