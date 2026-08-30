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
import {
  AsignarFuncionesDto,
  CrearEmpleadoDto,
  CrearFuncionDto,
  CrearHorarioDto,
  CrearNovedadDto,
  FiltroProductividadDto,
  MarcacionDto,
  ProgramarTurnoDto,
  SucursalPersonalDto,
} from './dto/personal.dto';
import { PersonalService } from './personal.service';
type AuthRequest = { user: UsuarioAutenticado };
@Controller('personal')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PersonalController {
  constructor(private readonly service: PersonalService) {}
  @Get() @Permisos('USUARIOS_VER') resumen(
    @Query() dto: SucursalPersonalDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.resumen(dto, req.user);
  }
  @Post('empleados') @Permisos('USUARIOS_CREAR') crearEmpleado(
    @Body() dto: CrearEmpleadoDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.crearEmpleado(dto, req.user);
  }
  @Post('funciones') @Permisos('USUARIOS_EDITAR') crearFuncion(
    @Body() dto: CrearFuncionDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.crearFuncion(dto, req.user);
  }
  @Post('empleados/:id/funciones') @Permisos('USUARIOS_EDITAR') asignar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AsignarFuncionesDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.asignarFunciones(id, dto, req.user);
  }
  @Post('empleados/:id/horarios') @Permisos('USUARIOS_EDITAR') horario(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CrearHorarioDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.crearHorario(id, dto, req.user);
  }
  @Post('turnos') @Permisos('USUARIOS_EDITAR') turno(
    @Body() dto: ProgramarTurnoDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.programarTurno(dto, req.user);
  }
  @Post('turnos/:id/entrada') @Permisos('USUARIOS_EDITAR') entrada(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MarcacionDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.marcar(id, 'ENTRADA', dto, req.user);
  }
  @Post('turnos/:id/salida') @Permisos('USUARIOS_EDITAR') salida(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MarcacionDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.marcar(id, 'SALIDA', dto, req.user);
  }
  @Post('novedades') @Permisos('USUARIOS_EDITAR') novedad(
    @Body() dto: CrearNovedadDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.novedad(dto, req.user);
  }
  @Get('productividad') @Permisos('REPORTES_VER') productividad(
    @Query() dto: FiltroProductividadDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.productividad(dto, req.user);
  }
}
