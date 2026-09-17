import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EstadoConflictoSync,
  Prisma,
  TipoConflictoSync,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';
import { EventoSyncWire } from './sync.types';

@Injectable()
export class SyncConflictService {
  constructor(private readonly prisma: PrismaService) {}

  async registrar(
    evento: EventoSyncWire,
    tipo: TipoConflictoSync,
    razon: string,
    payloadHashRecibido: string,
    payloadHashExistente?: string | null,
  ) {
    return this.prisma.syncConflicto.upsert({
      where: {
        eventId_tipo_payloadHashRecibido: {
          eventId: evento.eventId,
          tipo,
          payloadHashRecibido,
        },
      },
      update: {
        razon: razon.slice(0, 1000),
        payloadHashExistente: payloadHashExistente ?? null,
        estado: EstadoConflictoSync.ABIERTO,
        resolucion: null,
        resueltoEn: null,
      },
      create: {
        eventId: evento.eventId,
        nodoOrigenId: evento.sourceNodeId,
        nodoDestinoId: evento.destinationNodeId,
        restauranteGlobalId: evento.restauranteGlobalId ?? null,
        sucursalGlobalId: evento.sucursalGlobalId ?? null,
        tipoAgregado: evento.aggregateType,
        agregadoGlobalId: evento.aggregateGlobalId ?? null,
        tipoEvento: evento.eventType,
        tipo,
        razon: razon.slice(0, 1000),
        payloadHashRecibido,
        payloadHashExistente: payloadHashExistente ?? null,
      },
    });
  }

  async resolverAutomaticamente(eventId: string, payloadHash: string) {
    await this.prisma.syncConflicto.updateMany({
      where: {
        eventId,
        tipo: TipoConflictoSync.APLICACION_EVENTO,
        payloadHashRecibido: payloadHash,
        estado: EstadoConflictoSync.ABIERTO,
      },
      data: {
        estado: EstadoConflictoSync.RESUELTO,
        resolucion: 'El mismo evento fue aplicado correctamente en un reintento.',
        resueltoEn: new Date(),
      },
    });
  }

  async listar(usuario: UsuarioAutenticado, estado?: EstadoConflictoSync) {
    const alcance = await this.alcance(usuario);
    return this.prisma.syncConflicto.findMany({
      where: {
        ...alcance,
        ...(estado ? { estado } : {}),
      },
      orderBy: [{ creadoEn: 'desc' }, { id: 'desc' }],
      take: 200,
      select: {
        conflictoId: true,
        eventId: true,
        nodoOrigenId: true,
        nodoDestinoId: true,
        restauranteGlobalId: true,
        sucursalGlobalId: true,
        tipoAgregado: true,
        agregadoGlobalId: true,
        tipoEvento: true,
        tipo: true,
        razon: true,
        payloadHashRecibido: true,
        payloadHashExistente: true,
        estado: true,
        resolucion: true,
        creadoEn: true,
        actualizadoEn: true,
        resueltoEn: true,
      },
    });
  }

  async resolver(
    conflictoId: string,
    accion: 'RESUELTO' | 'DESCARTADO',
    resolucion: string,
    usuario: UsuarioAutenticado,
  ) {
    if (!resolucion?.trim() || resolucion.trim().length < 5) {
      throw new BadRequestException('La resolucion debe explicar la decision tomada');
    }
    const conflicto = await this.prisma.syncConflicto.findUnique({
      where: { conflictoId },
    });
    if (!conflicto) throw new NotFoundException('Conflicto de sincronizacion no encontrado');

    const alcance = await this.alcance(usuario);
    const permitido = await this.prisma.syncConflicto.count({
      where: { conflictoId, ...alcance },
    });
    if (permitido !== 1) {
      throw new ForbiddenException('Conflicto fuera del alcance del usuario');
    }

    return this.prisma.syncConflicto.update({
      where: { conflictoId },
      data: {
        estado:
          accion === 'DESCARTADO'
            ? EstadoConflictoSync.DESCARTADO
            : EstadoConflictoSync.RESUELTO,
        resolucion: resolucion.trim().slice(0, 1000),
        resueltoEn: new Date(),
      },
      select: {
        conflictoId: true,
        eventId: true,
        estado: true,
        resolucion: true,
        resueltoEn: true,
      },
    });
  }

  async resolverCertificacion(conflictoId: string, resolucion: string) {
    return this.prisma.syncConflicto.update({
      where: { conflictoId },
      data: {
        estado: EstadoConflictoSync.RESUELTO,
        resolucion: resolucion.slice(0, 1000),
        resueltoEn: new Date(),
      },
      select: {
        conflictoId: true,
        eventId: true,
        estado: true,
        resolucion: true,
        resueltoEn: true,
      },
    });
  }

  private async alcance(usuario: UsuarioAutenticado): Promise<Prisma.SyncConflictoWhereInput> {
    const global = usuario.rol === 'SUPERADMIN' && usuario.restauranteId === null;
    if (global) return {};
    if (usuario.restauranteId === null) {
      throw new ForbiddenException('La consulta requiere un contexto de restaurante');
    }
    const restaurante = await this.prisma.restaurante.findUnique({
      where: { id: usuario.restauranteId },
      select: { globalId: true },
    });
    if (!restaurante) throw new ForbiddenException('Restaurante fuera de alcance');

    if (usuario.sucursalId === null) {
      return { restauranteGlobalId: restaurante.globalId };
    }
    const sucursal = await this.prisma.sucursal.findFirst({
      where: { id: usuario.sucursalId, restauranteId: usuario.restauranteId },
      select: { globalId: true },
    });
    if (!sucursal) throw new ForbiddenException('Sucursal fuera de alcance');
    return {
      restauranteGlobalId: restaurante.globalId,
      sucursalGlobalId: sucursal.globalId,
    };
  }
}
