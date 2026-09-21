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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permisos } from '../auth/permisos.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';
import { CrearSolicitudQrDto, RechazarSolicitudQrDto } from './dto/menu-qr.dto';
import { MenuQrService } from './menu-qr.service';
import { MenuPublicacionService } from './menu-publicacion.service';

@Controller('publico')
export class MenuQrPublicoController {
  constructor(private readonly service: MenuQrService) {}
  @Get('menu-qr/:token') menu(@Param('token') token: string) {
    return this.service.menu(token);
  }
  @Post('menu-qr/:token/solicitudes') crear(
    @Param('token') token: string,
    @Body() dto: CrearSolicitudQrDto,
  ) {
    return this.service.crear(token, dto);
  }
  @Get('pedidos-qr/:id') estado(@Param('id') id: string) {
    return this.service.estado(id);
  }
}

type RequestAutenticada = { user: UsuarioAutenticado };

@Controller('pedidos-qr')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MenuQrController {
  constructor(
    private readonly service: MenuQrService,
    private readonly publicacion: MenuPublicacionService,
  ) {}

  @Get('publicacion')
  @Permisos('PEDIDOS_VER')
  estadoPublicacion(
    @Query('sucursalId', ParseIntPipe) sucursalId: number,
    @Req() req: RequestAutenticada,
  ) {
    return this.publicacion.estado(sucursalId, req.user);
  }

  @Post('publicacion')
  @Permisos('MESAS_EDITAR')
  publicarMenu(
    @Body() body: { sucursalId: number },
    @Req() req: RequestAutenticada,
  ) {
    return this.publicacion.publicar(Number(body.sucursalId), req.user);
  }

  @Post('publicacion/desactivar')
  @Permisos('MESAS_EDITAR')
  desactivarPublicacion(
    @Body() body: { sucursalId: number },
    @Req() req: RequestAutenticada,
  ) {
    return this.publicacion.desactivar(Number(body.sucursalId), req.user);
  }

  @Post('mesas/:mesaId/acceso')
  @Permisos('MESAS_EDITAR')
  acceso(
    @Param('mesaId', ParseIntPipe) mesaId: number,
    @Req() req: RequestAutenticada,
  ) {
    return this.service.generarAcceso(mesaId, req.user);
  }
  @Get('modo')
  @Permisos('PEDIDOS_VER')
  modo(
    @Query('sucursalId', ParseIntPipe) sucursalId: number,
    @Req() req: RequestAutenticada,
  ) {
    return this.service.modoSucursal(sucursalId, req.user);
  }

  @Get()
  @Permisos('PEDIDOS_VER')
  listar(
    @Query('sucursalId', ParseIntPipe) sucursalId: number,
    @Req() req: RequestAutenticada,
  ) {
    return this.service.listar(sucursalId, req.user);
  }
  @Post(':id/aceptar')
  @Permisos('PEDIDOS_CREAR')
  aceptar(@Param('id') id: string, @Req() req: RequestAutenticada) {
    return this.service.aceptar(id, req.user);
  }
  @Post(':id/rechazar')
  @Permisos('PEDIDOS_CREAR')
  rechazar(
    @Param('id') id: string,
    @Body() dto: RechazarSolicitudQrDto,
    @Req() req: RequestAutenticada,
  ) {
    return this.service.rechazar(id, dto.motivo, req.user);
  }
}
