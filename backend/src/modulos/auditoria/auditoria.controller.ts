import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permisos } from '../auth/permisos.decorator';
import { RequestAuditable } from './auditoria-contexto';
import { AuditoriaService } from './auditoria.service';
import { ListarAuditoriaDto } from './dto/listar-auditoria.dto';

@Controller('auditoria')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AuditoriaController {
  constructor(private readonly auditoriaService: AuditoriaService) {}

  @Get()
  @Permisos('AUDITORIA_VER')
  listar(
    @Query() filtros: ListarAuditoriaDto,
    @Req() request: RequestAuditable,
  ) {
    return this.auditoriaService.listar(filtros, request.user);
  }
}
