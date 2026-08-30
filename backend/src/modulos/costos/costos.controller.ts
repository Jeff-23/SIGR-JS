import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Capacidades } from '../auth/capacidades.decorator';
import { CapabilitiesGuard } from '../auth/capabilities.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permisos } from '../auth/permisos.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';
import { CostosService } from './costos.service';
import {
  FiltroRentabilidadDto,
  RendimientoProductoDto,
} from './dto/costos.dto';
type AuthRequest = { user: UsuarioAutenticado };
@Controller('costos')
@UseGuards(JwtAuthGuard, PermissionsGuard, CapabilitiesGuard)
@Capacidades('INVENTARIO')
export class CostosController {
  constructor(private readonly service: CostosService) {}
  @Get('recetas') @Permisos('INVENTARIO_VER') recetas(
    @Query('sucursalId', ParseIntPipe) id: number,
    @Req() req: AuthRequest,
  ) {
    return this.service.recetas(id, req.user);
  }
  @Patch('productos/:id/rendimiento')
  @Permisos('INVENTARIO_AJUSTAR')
  rendimiento(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RendimientoProductoDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.rendimiento(id, dto.rendimientoPorcentaje, req.user);
  }
  @Get('historial') @Permisos('INVENTARIO_VER') historial(
    @Query('sucursalId', ParseIntPipe) id: number,
    @Req() req: AuthRequest,
  ) {
    return this.service.historial(id, req.user);
  }
  @Get('rentabilidad') @Permisos('REPORTES_VER') rentabilidad(
    @Query() filtro: FiltroRentabilidadDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.rentabilidad(filtro, req.user);
  }
}
