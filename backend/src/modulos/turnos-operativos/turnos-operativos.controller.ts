import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permisos } from '../auth/permisos.decorator';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';
import { ActualizarTurnoOperativoDto, CrearTurnoOperativoDto } from './dto/turno-operativo.dto';
import { TurnosOperativosService } from './turnos-operativos.service';

type RequestAutenticada = { user: UsuarioAutenticado };

@Controller('turnos-operativos')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TurnosOperativosController {
  constructor(private readonly service: TurnosOperativosService) {}

  @Get()
  listar(
    @Query('sucursalId', ParseIntPipe) sucursalId: number,
    @Query('incluirInactivos') incluirInactivos: string | undefined,
    @Req() req: RequestAutenticada,
  ) {
    return this.service.listar(sucursalId, req.user, incluirInactivos === 'true' || incluirInactivos === '1');
  }

  @Post()
  @Permisos('CONFIGURACION_GESTIONAR')
  crear(@Body() dto: CrearTurnoOperativoDto, @Req() req: RequestAutenticada) {
    return this.service.crear(dto, req.user);
  }

  @Patch(':id')
  @Permisos('CONFIGURACION_GESTIONAR')
  actualizar(@Param('id', ParseIntPipe) id: number, @Body() dto: ActualizarTurnoOperativoDto, @Req() req: RequestAutenticada) {
    return this.service.actualizar(id, dto, req.user);
  }
}
