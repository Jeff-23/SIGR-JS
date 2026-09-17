import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  EstadoConflictoSync,
  EstadoSyncInbox,
  EstadoSyncOutbox,
} from '@prisma/client';

import { obtenerEntorno } from '../../config/entorno';
import { PrismaService } from '../../prisma/prisma.service';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';

@Injectable()
export class SyncStatusService {
  private readonly entorno = obtenerEntorno();

  constructor(private readonly prisma: PrismaService) {}

  async estado(usuario: UsuarioAutenticado) {
    const alcance = await this.alcance(usuario);
    return this.estadoPorAlcance(alcance);
  }

  estadoCertificacion() {
    return this.estadoPorAlcance({});
  }

  private async estadoPorAlcance(alcance: AlcanceSync) {
    const [
      pendientes,
      enviando,
      erroresOutbox,
      ultimoSincronizado,
      erroresInbox,
      ultimoAplicado,
      conflictosAbiertos,
      peer,
    ] = await Promise.all([
      this.prisma.syncOutbox.count({
        where: { ...alcance, estado: EstadoSyncOutbox.PENDIENTE },
      }),
      this.prisma.syncOutbox.count({
        where: { ...alcance, estado: EstadoSyncOutbox.ENVIANDO },
      }),
      this.prisma.syncOutbox.count({
        where: { ...alcance, estado: EstadoSyncOutbox.ERROR },
      }),
      this.prisma.syncOutbox.findFirst({
        where: {
          ...alcance,
          estado: EstadoSyncOutbox.SINCRONIZADO,
          sincronizadoEn: { not: null },
        },
        orderBy: { sincronizadoEn: 'desc' },
        select: { sincronizadoEn: true },
      }),
      this.prisma.syncInbox.count({
        where: { ...alcance, estado: EstadoSyncInbox.ERROR },
      }),
      this.prisma.syncInbox.findFirst({
        where: {
          ...alcance,
          estado: EstadoSyncInbox.APLICADO,
          aplicadoEn: { not: null },
        },
        orderBy: { aplicadoEn: 'desc' },
        select: { aplicadoEn: true },
      }),
      this.prisma.syncConflicto.count({
        where: { ...alcance, estado: EstadoConflictoSync.ABIERTO },
      }),
      this.estadoPeer(alcance),
    ]);

    const degradado =
      erroresOutbox > 0 || erroresInbox > 0 || conflictosAbiertos > 0;
    const estadoGeneral = !this.entorno.syncHabilitado
      ? 'DISABLED'
      : peer.reachable === false
        ? 'OFFLINE'
        : degradado
          ? 'DEGRADED'
          : 'HEALTHY';

    return {
      status: estadoGeneral,
      node: {
        id: this.entorno.syncNodeId,
        role: this.entorno.syncRol,
        syncEnabled: this.entorno.syncHabilitado,
      },
      peer,
      outbox: {
        pending: pendientes,
        sending: enviando,
        error: erroresOutbox,
        lastSynchronizedAt:
          ultimoSincronizado?.sincronizadoEn?.toISOString() ?? null,
      },
      inbox: {
        error: erroresInbox,
        lastAppliedAt: ultimoAplicado?.aplicadoEn?.toISOString() ?? null,
      },
      conflicts: {
        open: conflictosAbiertos,
      },
      checkedAt: new Date().toISOString(),
    };
  }

  private async estadoPeer(alcance: AlcanceSync) {
    if (!this.entorno.syncHabilitado) {
      return {
        configured: false,
        reachable: null,
        nodeId: null,
        lastContactAt: null,
      };
    }

    if (this.entorno.syncRol === 'EDGE') {
      const peerUrl = this.entorno.syncPeerUrl;
      const peerNodeId = this.entorno.syncPeerNodeId;
      if (!peerUrl || !peerNodeId) {
        return {
          configured: false,
          reachable: false,
          nodeId: peerNodeId ?? null,
          lastContactAt: null,
        };
      }

      let reachable = false;
      try {
        const base = peerUrl.replace(/\/$/, '');
        const respuesta = await fetch(`${base}/health/ready`, {
          method: 'GET',
          headers: { accept: 'application/json' },
          signal: AbortSignal.timeout(2500),
        });
        reachable = respuesta.ok;
      } catch {
        reachable = false;
      }

      return {
        configured: true,
        reachable,
        nodeId: peerNodeId,
        lastContactAt: null,
      };
    }

    if (this.entorno.syncRol === 'CLOUD') {
      const peer = await this.prisma.syncPeer.findFirst({
        where: {
          activo: true,
          ...alcance,
        },
        orderBy: [{ ultimoAccesoEn: 'desc' }, { id: 'desc' }],
        select: { nodeId: true, ultimoAccesoEn: true },
      });
      return {
        configured: Boolean(peer),
        // CLOUD recibe conexiones; no realiza un sondeo activo del EDGE.
        reachable: null,
        nodeId: peer?.nodeId ?? null,
        lastContactAt: peer?.ultimoAccesoEn?.toISOString() ?? null,
      };
    }

    return {
      configured: false,
      reachable: null,
      nodeId: null,
      lastContactAt: null,
    };
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
    if (!restaurante) {
      throw new ForbiddenException('Restaurante fuera de alcance');
    }

    if (usuario.sucursalId === null) {
      return { restauranteGlobalId: restaurante.globalId };
    }

    const sucursal = await this.prisma.sucursal.findFirst({
      where: {
        id: usuario.sucursalId,
        restauranteId: usuario.restauranteId,
      },
      select: { globalId: true },
    });
    if (!sucursal) {
      throw new ForbiddenException('Sucursal fuera de alcance');
    }

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
