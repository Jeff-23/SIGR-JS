import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permisos } from '../auth/permisos.decorator';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';
import { SyncCertGuard } from './sync-cert.guard';
import { SyncDiagnosticsService } from './sync-diagnostics.service';

type RequestAutenticada = { user: UsuarioAutenticado };

@Controller('sync/diagnostico')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SyncDiagnosticsController {
  constructor(private readonly diagnostico: SyncDiagnosticsService) {}

  @Get('outbox')
  @Permisos('AUDITORIA_VER')
  listarOutbox(@Req() request: RequestAutenticada) {
    return this.diagnostico.listarOutbox(request.user);
  }

  @Get('inbox')
  @Permisos('AUDITORIA_VER')
  listarInbox(@Req() request: RequestAutenticada) {
    return this.diagnostico.listarInbox(request.user);
  }

  @Post('outbox/:eventId/reintentar')
  @Permisos('SYNC_CONFLICTOS_GESTIONAR')
  reintentarOutbox(
    @Param('eventId', new ParseUUIDPipe({ version: '4' })) eventId: string,
    @Body() body: unknown,
    @Req() request: RequestAutenticada,
  ) {
    if (!confirmado(body)) {
      throw new BadRequestException('El reintento requiere confirmar=true');
    }
    return this.diagnostico.reintentarOutbox(eventId, request.user);
  }
}

@Controller('sync/internal/certification/diagnostics')
@UseGuards(SyncCertGuard)
export class SyncDiagnosticsCertificationController {
  constructor(private readonly diagnostico: SyncDiagnosticsService) {}

  @Get('outbox')
  listarOutbox() {
    return this.diagnostico.listarOutboxCertificacion();
  }

  @Get('inbox')
  listarInbox() {
    return this.diagnostico.listarInboxCertificacion();
  }

  @Post('outbox/:eventId/retry')
  reintentarOutbox(@Param('eventId') eventId: string) {
    return this.diagnostico.reintentarOutboxCertificacion(eventId);
  }
}

function confirmado(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  return (body as Record<string, unknown>).confirmar === true;
}
