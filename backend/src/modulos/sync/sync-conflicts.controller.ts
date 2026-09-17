import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { EstadoConflictoSync } from '@prisma/client';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permisos } from '../auth/permisos.decorator';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';
import { SyncConflictService } from './sync-conflict.service';

type RequestAutenticada = { user: UsuarioAutenticado };

@Controller('sync/conflictos')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SyncConflictsController {
  constructor(private readonly conflictos: SyncConflictService) {}

  @Get()
  @Permisos('AUDITORIA_VER')
  listar(
    @Req() request: RequestAutenticada,
    @Query('estado') estado?: string,
  ) {
    const normalizado = estado?.trim().toUpperCase();
    if (
      normalizado &&
      !Object.values(EstadoConflictoSync).includes(normalizado as EstadoConflictoSync)
    ) {
      throw new BadRequestException('Estado de conflicto invalido');
    }
    return this.conflictos.listar(
      request.user,
      normalizado as EstadoConflictoSync | undefined,
    );
  }

  @Post(':conflictoId/resolver')
  @Permisos('SYNC_CONFLICTOS_GESTIONAR')
  resolver(
    @Param('conflictoId') conflictoId: string,
    @Body() body: unknown,
    @Req() request: RequestAutenticada,
  ) {
    const data = objeto(body);
    const accion = texto(data.accion).toUpperCase();
    if (accion !== 'RESUELTO' && accion !== 'DESCARTADO') {
      throw new BadRequestException('accion debe ser RESUELTO o DESCARTADO');
    }
    return this.conflictos.resolver(
      conflictoId,
      accion,
      texto(data.resolucion),
      request.user,
    );
  }
}

function objeto(valor: unknown): Record<string, unknown> {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) {
    throw new BadRequestException('Body invalido');
  }
  return valor as Record<string, unknown>;
}

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim() : '';
}
