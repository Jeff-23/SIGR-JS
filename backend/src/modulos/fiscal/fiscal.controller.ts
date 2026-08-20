import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permisos } from '../auth/permisos.decorator';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';
import { ConfigurarPerfilFiscalDto } from './dto/configurar-perfil-fiscal.dto';
import { CrearResolucionDto } from './dto/crear-resolucion.dto';
import { FiscalService } from './fiscal.service';

type RequestAutenticada = { user: UsuarioAutenticado };

@Controller('fiscal/restaurantes/:restauranteId')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FiscalController {
  constructor(private readonly fiscal: FiscalService) {}

  @Get('perfil')
  @Permisos('CONFIGURACION_VER')
  perfil(
    @Param('restauranteId', ParseIntPipe) id: number,
    @Req() req: RequestAutenticada,
  ) {
    return this.fiscal.obtenerPerfil(id, req.user);
  }

  @Put('perfil')
  @Permisos('CONFIGURACION_GESTIONAR')
  configurar(
    @Param('restauranteId', ParseIntPipe) id: number,
    @Body() dto: ConfigurarPerfilFiscalDto,
    @Req() req: RequestAutenticada,
  ) {
    return this.fiscal.configurarPerfil(id, dto, req.user);
  }

  @Get('resoluciones')
  @Permisos('CONFIGURACION_VER')
  resoluciones(
    @Param('restauranteId', ParseIntPipe) id: number,
    @Req() req: RequestAutenticada,
  ) {
    return this.fiscal.listarResoluciones(id, req.user);
  }

  @Post('resoluciones')
  @Permisos('CONFIGURACION_GESTIONAR')
  crearResolucion(
    @Param('restauranteId', ParseIntPipe) id: number,
    @Body() dto: CrearResolucionDto,
    @Req() req: RequestAutenticada,
  ) {
    return this.fiscal.crearResolucion(id, dto, req.user);
  }
}
