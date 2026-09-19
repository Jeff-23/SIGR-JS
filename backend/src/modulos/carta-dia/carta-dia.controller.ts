import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permisos } from '../auth/permisos.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';
import { CartaDiaService, ArchivoCarta } from './carta-dia.service';
import { GuardarCartaDiaDto } from './dto/guardar-carta-dia.dto';
import {
  GuardarIdentidadCartaDto,
  GuardarPerfilCartaDto,
} from './dto/perfil-carta.dto';

type RequestAutenticada = { user: UsuarioAutenticado };

@Controller('cartas-dia')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CartaDiaController {
  constructor(private readonly service: CartaDiaService) {}

  @Get(':sucursalId/identidad')
  @Permisos('PRODUCTOS_EDITAR')
  obtenerIdentidad(
    @Param('sucursalId', ParseIntPipe) sucursalId: number,
    @Req() req: RequestAutenticada,
  ) {
    return this.service.obtenerIdentidad(sucursalId, req.user);
  }

  @Put(':sucursalId/identidad')
  @Permisos('PRODUCTOS_EDITAR')
  guardarIdentidad(
    @Param('sucursalId', ParseIntPipe) sucursalId: number,
    @Body() dto: GuardarIdentidadCartaDto,
    @Req() req: RequestAutenticada,
  ) {
    return this.service.guardarIdentidad(sucursalId, dto, req.user);
  }

  @Get(':sucursalId/perfiles')
  @Permisos('PRODUCTOS_EDITAR')
  perfiles(
    @Param('sucursalId', ParseIntPipe) sucursalId: number,
    @Req() req: RequestAutenticada,
  ) {
    return this.service.listarPerfiles(sucursalId, req.user);
  }

  @Post(':sucursalId/perfiles')
  @Permisos('PRODUCTOS_EDITAR')
  crearPerfil(
    @Param('sucursalId', ParseIntPipe) sucursalId: number,
    @Body() dto: GuardarPerfilCartaDto,
    @Req() req: RequestAutenticada,
  ) {
    return this.service.crearPerfil(sucursalId, dto, req.user);
  }

  @Put(':sucursalId/perfiles/:perfilId')
  @Permisos('PRODUCTOS_EDITAR')
  actualizarPerfil(
    @Param('sucursalId', ParseIntPipe) sucursalId: number,
    @Param('perfilId', ParseIntPipe) perfilId: number,
    @Body() dto: GuardarPerfilCartaDto,
    @Req() req: RequestAutenticada,
  ) {
    return this.service.actualizarPerfil(sucursalId, perfilId, dto, req.user);
  }

  @Get(':sucursalId/perfiles/:perfilId/:fecha')
  @Permisos('PRODUCTOS_EDITAR')
  obtenerCartaPerfil(
    @Param('sucursalId', ParseIntPipe) sucursalId: number,
    @Param('perfilId', ParseIntPipe) perfilId: number,
    @Param('fecha') fecha: string,
    @Req() req: RequestAutenticada,
  ) {
    return this.service.obtenerCartaPerfil(
      sucursalId,
      perfilId,
      fecha,
      req.user,
    );
  }

  @Put(':sucursalId/perfiles/:perfilId/:fecha')
  @Permisos('PRODUCTOS_EDITAR')
  guardarCartaPerfil(
    @Param('sucursalId', ParseIntPipe) sucursalId: number,
    @Param('perfilId', ParseIntPipe) perfilId: number,
    @Param('fecha') fecha: string,
    @Body() dto: GuardarCartaDiaDto,
    @Req() req: RequestAutenticada,
  ) {
    return this.service.guardarCartaPerfil(
      sucursalId,
      perfilId,
      fecha,
      dto,
      req.user,
    );
  }

  @Post(':sucursalId/recursos')
  @Permisos('PRODUCTOS_EDITAR')
  @UseInterceptors(
    FileInterceptor('archivo', {
      limits: { fileSize: 4 * 1024 * 1024, files: 1 },
    }),
  )
  guardarRecurso(
    @Param('sucursalId', ParseIntPipe) sucursalId: number,
    @UploadedFile() archivo: ArchivoCarta | undefined,
    @Req() req: RequestAutenticada,
  ) {
    if (!archivo) throw new BadRequestException('Selecciona una imagen');
    return this.service.guardarRecurso(sucursalId, archivo, req.user);
  }

  // Contrato S56 anterior: usa el perfil predeterminado.
  @Get(':sucursalId/:fecha')
  @Permisos('PRODUCTOS_EDITAR')
  obtener(
    @Param('sucursalId', ParseIntPipe) sucursalId: number,
    @Param('fecha') fecha: string,
    @Req() req: RequestAutenticada,
  ) {
    return this.service.obtener(sucursalId, fecha, req.user);
  }

  @Put(':sucursalId/:fecha')
  @Permisos('PRODUCTOS_EDITAR')
  guardar(
    @Param('sucursalId', ParseIntPipe) sucursalId: number,
    @Param('fecha') fecha: string,
    @Body() dto: GuardarCartaDiaDto,
    @Req() req: RequestAutenticada,
  ) {
    return this.service.guardar(sucursalId, fecha, dto, req.user);
  }
}
