import { Controller, Get, Req, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permisos } from '../auth/permisos.decorator';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';
import { SyncCertGuard } from './sync-cert.guard';
import { SyncStatusService } from './sync-status.service';

type RequestAutenticada = { user: UsuarioAutenticado };

@Controller('sync')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SyncStatusController {
  constructor(private readonly status: SyncStatusService) {}

  @Get('estado')
  @Permisos('AUDITORIA_VER')
  estado(@Req() request: RequestAutenticada) {
    return this.status.estado(request.user);
  }
}

@Controller('sync/internal/certification')
@UseGuards(SyncCertGuard)
export class SyncStatusCertificationController {
  constructor(private readonly status: SyncStatusService) {}

  @Get('operational-status')
  estadoOperativo() {
    return this.status.estadoCertificacion();
  }
}
