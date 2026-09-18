import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EstadoSyncInbox, EstadoSyncOutbox } from '@prisma/client';

import { obtenerEntorno } from '../../config/entorno';
import { PrismaService } from '../../prisma/prisma.service';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';

@Injectable()
export class SyncDiagnosticsService {
  private readonly entorno = obtenerEntorno();

  constructor(private readonly prisma: PrismaService) {}

  async listarOutbox(usuario: UsuarioAutenticado) {
    const alcance = await this.alcance(usuario);
    return this.listarOutboxPorAlcance(alcance);
  }

  listarOutboxCertificacion() {
    return this.listarOutboxPorAlcance({});
  }

  async listarInbox(usuario: UsuarioAutenticado) {
    const alcance = await this.alcance(usuario);
    return this.listarInboxPorAlcance(alcance);
  }

  listarInboxCertificacion() {
    return this.listarInboxPorAlcance({});
  }

  async reintentarOutbox(eventId: string, usuario: UsuarioAutenticado) {
    const alcance = await this.alcance(usuario);
    return this.reintentarOutboxPorAlcance(eventId, alcance);
  }

  reintentarOutboxCertificacion(eventId: string) {
    return this.reintentarOutboxPorAlcance(eventId, {});
  }

  private async listarOutboxPorAlcance(alcance: AlcanceSync) {
    const filas = await this.prisma.syncOutbox.findMany({
      where: { ...alcance, estado: EstadoSyncOutbox.ERROR },
      orderBy: [{ ultimoIntentoEn: 'desc' }, { id: 'desc' }],
      take: 200,
      select: {
        eventId: true,
        nodoOrigenId: true,
        nodoDestinoId: true,
        restauranteGlobalId: true,
        sucursalGlobalId: true,
        tipoAgregado: true,
        agregadoGlobalId: true,
        tipoEvento: true,
        ocurridoEn: true,
        creadoEn: true,
        intentos: true,
        ultimoIntentoEn: true,
        proximoIntentoEn: true,
        ultimoError: true,
      },
    });

    const peersActivos = await this.peersActivos(alcance);
    const ahora = new Date();

    return {
      total: filas.length,
      items: filas.map((fila) => {
        const diagnostico = this.clasificarOutbox(
          fila.nodoDestinoId,
          fila.proximoIntentoEn,
          peersActivos,
          ahora,
        );
        return {
          ...fila,
          ocurridoEn: fila.ocurridoEn.toISOString(),
          creadoEn: fila.creadoEn.toISOString(),
          ultimoIntentoEn: fila.ultimoIntentoEn?.toISOString() ?? null,
          proximoIntentoEn: fila.proximoIntentoEn?.toISOString() ?? null,
          ultimoError: fila.ultimoError?.slice(0, 500) ?? null,
          clasificacion: diagnostico.clasificacion,
          reintentoManualPermitido: diagnostico.reintentoManualPermitido,
        };
      }),
      checkedAt: ahora.toISOString(),
    };
  }

  private async listarInboxPorAlcance(alcance: AlcanceSync) {
    const filas = await this.prisma.syncInbox.findMany({
      where: { ...alcance, estado: EstadoSyncInbox.ERROR },
      orderBy: [{ recibidoEn: 'desc' }, { id: 'desc' }],
      take: 200,
      select: {
        eventId: true,
        nodoOrigenId: true,
        restauranteGlobalId: true,
        sucursalGlobalId: true,
        tipoAgregado: true,
        agregadoGlobalId: true,
        tipoEvento: true,
        ocurridoEn: true,
        recibidoEn: true,
        aplicadoEn: true,
        ultimoError: true,
      },
    });

    return {
      total: filas.length,
      items: filas.map((fila) => ({
        ...fila,
        ocurridoEn: fila.ocurridoEn.toISOString(),
        recibidoEn: fila.recibidoEn.toISOString(),
        aplicadoEn: fila.aplicadoEn?.toISOString() ?? null,
        ultimoError: fila.ultimoError?.slice(0, 500) ?? null,
        clasificacion: this.clasificarInbox(fila.ultimoError),
        reintentoManualPermitido: false,
      })),
      checkedAt: new Date().toISOString(),
    };
  }

  private async reintentarOutboxPorAlcance(
    eventId: string,
    alcance: AlcanceSync,
  ) {
    if (!this.entorno.syncHabilitado) {
      throw new BadRequestException(
        'La sincronizacion esta deshabilitada en este nodo',
      );
    }

    const evento = await this.prisma.syncOutbox.findFirst({
      where: { eventId, ...alcance },
      select: {
        eventId: true,
        estado: true,
        nodoDestinoId: true,
        intentos: true,
      },
    });
    if (!evento) throw new NotFoundException('Evento Outbox no encontrado');
    if (evento.estado !== EstadoSyncOutbox.ERROR) {
      throw new BadRequestException(
        'Solo se puede reintentar un evento Outbox en ERROR',
      );
    }

    const peersActivos = await this.peersActivos(alcance);
    const diagnostico = this.clasificarOutbox(
      evento.nodoDestinoId,
      null,
      peersActivos,
      new Date(),
    );
    if (!diagnostico.reintentoManualPermitido) {
      throw new BadRequestException(
        'El evento apunta a un destino que ya no esta activo; requiere revision, no reintento automatico',
      );
    }

    const actualizado = await this.prisma.syncOutbox.updateMany({
      where: {
        eventId,
        estado: EstadoSyncOutbox.ERROR,
        ...alcance,
      },
      data: {
        estado: EstadoSyncOutbox.PENDIENTE,
        proximoIntentoEn: null,
      },
    });
    if (actualizado.count !== 1) {
      throw new BadRequestException(
        'El evento cambio de estado antes del reintento',
      );
    }

    return {
      eventId,
      estado: EstadoSyncOutbox.PENDIENTE,
      intentosPrevios: evento.intentos,
      mensaje: 'Evento reencolado para un nuevo intento controlado.',
    };
  }

  private async peersActivos(alcance: AlcanceSync): Promise<Set<string>> {
    if (!this.entorno.syncHabilitado) return new Set();
    if (this.entorno.syncRol === 'EDGE') {
      return new Set(
        this.entorno.syncPeerNodeId ? [this.entorno.syncPeerNodeId] : [],
      );
    }
    if (this.entorno.syncRol !== 'CLOUD') return new Set();

    const peers = await this.prisma.syncPeer.findMany({
      where: { ...alcance, activo: true },
      select: { nodeId: true },
    });
    return new Set(peers.map((peer) => peer.nodeId));
  }

  private clasificarOutbox(
    destino: string,
    proximoIntentoEn: Date | null,
    peersActivos: Set<string>,
    ahora: Date,
  ) {
    if (!this.entorno.syncHabilitado) {
      return {
        clasificacion: 'SIN_SYNC' as const,
        reintentoManualPermitido: false,
      };
    }
    if (!peersActivos.has(destino)) {
      return {
        clasificacion: 'HISTORICO_DESTINO' as const,
        reintentoManualPermitido: false,
      };
    }
    if (proximoIntentoEn && proximoIntentoEn > ahora) {
      return {
        clasificacion: 'EN_ESPERA' as const,
        reintentoManualPermitido: true,
      };
    }
    return {
      clasificacion: 'REINTENTABLE' as const,
      reintentoManualPermitido: true,
    };
  }

  private clasificarInbox(ultimoError: string | null) {
    if (ultimoError?.startsWith('Tipo de evento no soportado')) {
      return 'NO_SOPORTADO' as const;
    }
    return 'REQUIERE_REVISION' as const;
  }

  private async alcance(usuario: UsuarioAutenticado): Promise<AlcanceSync> {
    const global =
      usuario.rol === 'SUPERADMIN' && usuario.restauranteId === null;
    if (global) return {};
    if (usuario.restauranteId === null) {
      throw new ForbiddenException(
        'La consulta requiere un contexto de restaurante',
      );
    }

    const restaurante = await this.prisma.restaurante.findUnique({
      where: { id: usuario.restauranteId },
      select: { globalId: true },
    });
    if (!restaurante)
      throw new ForbiddenException('Restaurante fuera de alcance');

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

type AlcanceSync = {
  restauranteGlobalId?: string;
  sucursalGlobalId?: string;
};
