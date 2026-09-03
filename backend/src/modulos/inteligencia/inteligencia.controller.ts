import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permisos } from '../auth/permisos.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';
import {
  ConfigurarMinimoDto,
  CrearMetaDto,
  FiltroInteligenciaDto,
} from './dto/inteligencia.dto';
import { InteligenciaService } from './inteligencia.service';
type AuthRequest = { user: UsuarioAutenticado };
@Controller('inteligencia')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InteligenciaController {
  constructor(private readonly service: InteligenciaService) {}
  @Get() @Permisos('REPORTES_VER') tablero(
    @Query() dto: FiltroInteligenciaDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.tablero(dto, req.user);
  }
  @Get('operacion-en-vivo')
  @Permisos('REPORTES_VER')
  operacionEnVivo(
    @Query('sucursalId', ParseIntPipe) sucursalId: number,
    @Req() req: AuthRequest,
  ) {
    return this.service.operacionEnVivo(sucursalId, req.user);
  }

  @Patch('articulos/:id/minimo') @Permisos('INVENTARIO_AJUSTAR') minimo(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ConfigurarMinimoDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.configurarMinimo(id, dto, req.user);
  }
  @Post('metas') @Permisos('CONFIGURACION_GESTIONAR') meta(
    @Body() dto: CrearMetaDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.crearMeta(dto, req.user);
  }
}
