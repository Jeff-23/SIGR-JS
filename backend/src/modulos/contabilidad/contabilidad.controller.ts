import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permisos } from '../auth/permisos.decorator';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';
import { ContabilidadService } from './contabilidad.service';

type RequestAutenticada = { user: UsuarioAutenticado };

@Controller('contabilidad')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permisos('CONTABILIDAD_VER')
export class ContabilidadController {
  constructor(private readonly service: ContabilidadService) {}

  @Get('consulta')
  consulta(
    @Query('sucursalId') sucursalId: string,
    @Query('desde') desde: string,
    @Query('hasta') hasta: string,
    @Req() request: RequestAutenticada,
  ) {
    return this.service.consulta(
      Number(sucursalId),
      desde,
      hasta,
      request.user,
    );
  }

  @Get('libro')
  libro(
    @Query('sucursalId') sucursalId: string,
    @Query('desde') desde: string,
    @Query('hasta') hasta: string,
    @Req() request: RequestAutenticada,
  ) {
    return this.service.libro(
      Number(sucursalId),
      desde,
      hasta,
      request.user,
    );
  }
}
