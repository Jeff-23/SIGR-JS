import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permisos } from '../auth/permisos.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';
import { CartaDiaService } from './carta-dia.service';
import { GuardarCartaDiaDto } from './dto/guardar-carta-dia.dto';
import { GuardarPlantillaCartaDto } from './dto/guardar-plantilla-carta.dto';

type RequestAutenticada = { user: UsuarioAutenticado };

@Controller('cartas-dia')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CartaDiaController {
  constructor(private readonly service: CartaDiaService) {}

  @Get(':sucursalId/plantilla')
  @Permisos('PRODUCTOS_EDITAR')
  obtenerPlantilla(
    @Param('sucursalId', ParseIntPipe) sucursalId: number,
    @Req() req: RequestAutenticada,
  ) {
    return this.service.obtenerPlantilla(sucursalId, req.user);
  }

  @Put(':sucursalId/plantilla')
  @Permisos('PRODUCTOS_EDITAR')
  guardarPlantilla(
    @Param('sucursalId', ParseIntPipe) sucursalId: number,
    @Body() dto: GuardarPlantillaCartaDto,
    @Req() req: RequestAutenticada,
  ) {
    return this.service.guardarPlantilla(sucursalId, dto, req.user);
  }

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
