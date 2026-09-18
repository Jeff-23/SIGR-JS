import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
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

  @Post('outbox/sanear-transitorios')
  @Permisos('SYNC_CONFLICTOS_GESTIONAR')
  sanearOutboxTransitorios(
    @Body() body: unknown,
    @Req() request: RequestAutenticada,
  ) {
    if (!confirmado(body)) {
      throw new BadRequestException('El saneamiento requiere confirmar=true');
    }
    return this.diagnostico.sanearOutboxTransitorios(
      request.user,
      limiteBody(body),
    );
  }

  @Post('inbox/:eventId/reintentar')
  @Permisos('SYNC_CONFLICTOS_GESTIONAR')
  reintentarInbox(
    @Param('eventId', new ParseUUIDPipe({ version: '4' })) eventId: string,
    @Body() body: unknown,
    @Req() request: RequestAutenticada,
  ) {
    if (!confirmado(body)) {
      throw new BadRequestException('El reintento requiere confirmar=true');
    }
    return this.diagnostico.reintentarInbox(eventId, request.user);
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

  @Post('outbox/sanitize-transient')
  sanearOutbox(@Query('limit') limite?: string) {
    return this.diagnostico.sanearOutboxTransitoriosCertificacion(
      limiteQuery(limite),
    );
  }

  @Post('outbox/seed-transient')
  crearOutboxTransitorio(@Body() body: unknown) {
    const data = objetoOpcional(body);
    return this.diagnostico.crearOutboxErrorTransitorioCertificacion(
      textoOpcional(data.restauranteGlobalId),
      textoOpcional(data.sucursalGlobalId),
    );
  }

  @Post('inbox/:eventId/retry')
  reintentarInbox(@Param('eventId') eventId: string) {
    return this.diagnostico.reintentarInboxCertificacion(eventId);
  }

  @Post('inbox/seed')
  crearInboxError(@Body() body: unknown) {
    const tipo = tipoInboxCertificacion(body);
    return this.diagnostico.crearInboxErrorCertificacion(tipo);
  }

  @Delete('inbox/:eventId')
  limpiarInbox(@Param('eventId') eventId: string) {
    return this.diagnostico.limpiarInboxCertificacion(eventId);
  }
}

function confirmado(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  return (body as Record<string, unknown>).confirmar === true;
}

function limiteBody(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 10;
  const valor = (body as Record<string, unknown>).limite;
  return limiteSeguro(valor);
}

function limiteQuery(valor?: string) {
  return limiteSeguro(valor);
}

function limiteSeguro(valor: unknown) {
  const numero = Number(valor ?? 10);
  if (!Number.isFinite(numero)) return 10;
  return Math.min(Math.max(Math.trunc(numero), 1), 25);
}

function tipoInboxCertificacion(body: unknown): 'RECUPERABLE' | 'NO_SOPORTADO' {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    return 'RECUPERABLE';
  return (body as Record<string, unknown>).tipo === 'NO_SOPORTADO'
    ? 'NO_SOPORTADO'
    : 'RECUPERABLE';
}

function objetoOpcional(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return {};
  return body as Record<string, unknown>;
}

function textoOpcional(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
