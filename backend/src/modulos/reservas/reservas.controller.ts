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
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permisos } from '../auth/permisos.decorator';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';
import {
  CambiarEstadoEsperaDto,
  CambiarEstadoReservaDto,
  CrearEsperaDto,
  CrearReservaDto,
  SentarDto,
} from './dto/reservas.dto';
import { ReservasService } from './reservas.service';

type RequestAutenticada = { user: UsuarioAutenticado };

@Controller('reservas')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReservasController {
  constructor(private readonly reservas: ReservasService) {}

  @Post()
  @Permisos('MESAS_EDITAR')
  crear(@Body() data: CrearReservaDto, @Req() req: RequestAutenticada) {
    return this.reservas.crear(data, req.user);
  }

  @Get()
  @Permisos('MESAS_VER')
  listar(
    @Req() req: RequestAutenticada,
    @Query('sucursalId', new ParseIntPipe({ optional: true }))
    sucursalId?: number,
    @Query('fecha') fecha?: string,
  ) {
    return this.reservas.listar(req.user, sucursalId, fecha);
  }

  @Patch(':id/estado')
  @Permisos('MESAS_EDITAR')
  estado(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: CambiarEstadoReservaDto,
    @Req() req: RequestAutenticada,
  ) {
    return this.reservas.cambiarEstado(id, data, req.user);
  }

  @Post(':id/sentar')
  @Permisos('MESAS_EDITAR')
  sentar(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: SentarDto,
    @Req() req: RequestAutenticada,
  ) {
    return this.reservas.sentarReserva(id, data, req.user);
  }

  @Post('espera')
  @Permisos('MESAS_EDITAR')
  crearEspera(@Body() data: CrearEsperaDto, @Req() req: RequestAutenticada) {
    return this.reservas.crearEspera(data, req.user);
  }

  @Get('espera/activas')
  @Permisos('MESAS_VER')
  espera(
    @Req() req: RequestAutenticada,
    @Query('sucursalId', new ParseIntPipe({ optional: true }))
    sucursalId?: number,
  ) {
    return this.reservas.listarEspera(req.user, sucursalId);
  }

  @Patch('espera/:id/estado')
  @Permisos('MESAS_EDITAR')
  estadoEspera(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: CambiarEstadoEsperaDto,
    @Req() req: RequestAutenticada,
  ) {
    return this.reservas.cambiarEspera(id, data, req.user);
  }

  @Post('espera/:id/sentar')
  @Permisos('MESAS_EDITAR')
  sentarEspera(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: SentarDto,
    @Req() req: RequestAutenticada,
  ) {
    return this.reservas.sentarEspera(id, data, req.user);
  }
}
