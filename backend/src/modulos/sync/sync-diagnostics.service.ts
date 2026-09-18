import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { EstadoSyncInbox, EstadoSyncOutbox, Prisma } from '@prisma/client';

import { obtenerEntorno } from '../../config/entorno';
import { PrismaService } from '../../prisma/prisma.service';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';
import { hashPayload } from './sync.crypto';
import { SyncInboxService } from './sync-inbox.service';
import { EventoSyncWire } from './sync.types';

@Injectable()
export class SyncDiagnosticsService {
  private readonly entorno = obtenerEntorno();

  constructor(
    private readonly prisma: PrismaService,
    private readonly inbox: SyncInboxService,
  ) {}

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

  async sanearOutboxTransitorios(usuario: UsuarioAutenticado, limite: number) {
    const alcance = await this.alcance(usuario);
    return this.sanearOutboxTransitoriosPorAlcance(alcance, limite);
  }

  sanearOutboxTransitoriosCertificacion(limite: number) {
    return this.sanearOutboxTransitoriosPorAlcance({}, limite);
  }

  async reintentarInbox(eventId: string, usuario: UsuarioAutenticado) {
    const alcance = await this.alcance(usuario);
    return this.reintentarInboxPorAlcance(eventId, alcance);
  }

  reintentarInboxCertificacion(eventId: string) {
    return this.reintentarInboxPorAlcance(eventId, {});
  }

  async crearOutboxErrorTransitorioCertificacion(
    restauranteGlobalId?: string | null,
    sucursalGlobalId?: string | null,
  ) {
    if (!this.entorno.syncHabilitado || !this.entorno.syncPeerNodeId) {
      throw new BadRequestException(
        'El nodo no tiene sincronizacion/peer configurados para certificar Outbox',
      );
    }

    const eventId = randomUUID();
    const payload = {
      certification: '49C',
      nonce: randomUUID(),
    } satisfies Prisma.InputJsonObject;
    await this.prisma.syncOutbox.create({
      data: {
        eventId,
        nodoOrigenId: this.entorno.syncNodeId,
        nodoDestinoId: this.entorno.syncPeerNodeId,
        restauranteGlobalId: restauranteGlobalId ?? null,
        sucursalGlobalId: sucursalGlobalId ?? null,
        tipoAgregado: 'SYNC_CERT_49C',
        agregadoGlobalId: null,
        tipoEvento: 'SYNC.PING',
        versionEsquema: 1,
        payload,
        payloadHash: hashPayload(payload),
        ocurridoEn: new Date(),
        estado: EstadoSyncOutbox.ERROR,
        intentos: 1,
        ultimoIntentoEn: new Date(),
        proximoIntentoEn: new Date(Date.now() + 60 * 60 * 1000),
        ultimoError:
          'fetch failed: error transitorio simulado por certificacion 49C',
      },
    });
    return { eventId };
  }

  async crearInboxErrorCertificacion(
    tipo: 'RECUPERABLE' | 'NO_SOPORTADO' = 'RECUPERABLE',
  ) {
    if (!this.entorno.syncHabilitado) {
      throw new BadRequestException(
        'La sincronizacion esta deshabilitada en este nodo',
      );
    }

    const eventId = randomUUID();
    const payload = {
      certification: '49C',
      nonce: randomUUID(),
      tipo,
    } satisfies Prisma.InputJsonObject;
    const tipoEvento =
      tipo === 'NO_SOPORTADO' ? 'CERT.49C.NO_SOPORTADO' : 'SYNC.PING';
    const ultimoError =
      tipo === 'NO_SOPORTADO'
        ? `Tipo de evento no soportado todavia: ${tipoEvento}`
        : 'Error transitorio simulado para certificar reaplicacion controlada Inbox 49C';

    await this.prisma.syncInbox.create({
      data: {
        eventId,
        nodoOrigenId: this.entorno.syncPeerNodeId ?? 'certification-peer',
        restauranteGlobalId: null,
        sucursalGlobalId: null,
        tipoAgregado: 'SYNC_CERT_49C',
        agregadoGlobalId: null,
        tipoEvento,
        versionEsquema: 1,
        payload,
        payloadHash: hashPayload(payload),
        ocurridoEn: new Date(),
        estado: EstadoSyncInbox.ERROR,
        ultimoError,
      },
    });

    return { eventId, tipoEvento, tipo };
  }

  async limpiarInboxCertificacion(eventId: string) {
    const fila = await this.prisma.syncInbox.findUnique({
      where: { eventId },
      select: { tipoAgregado: true },
    });
    if (!fila || fila.tipoAgregado !== 'SYNC_CERT_49C') {
      throw new BadRequestException(
        'Solo se pueden limpiar filas creadas por la certificacion 49C',
      );
    }
    await this.prisma.syncInbox.delete({ where: { eventId } });
    return { eventId, eliminado: true };
  }

  private async listarOutboxPorAlcance(alcance: AlcanceSync) {
    const [total, filas] = await Promise.all([
      this.prisma.syncOutbox.count({
        where: { ...alcance, estado: EstadoSyncOutbox.ERROR },
      }),
      this.prisma.syncOutbox.findMany({
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
      }),
    ]);

    const peersActivos = await this.peersActivos(alcance);
    const ahora = new Date();

    return {
      total,
      items: filas.map((fila) => {
        const diagnostico = this.clasificarOutbox(
          fila.nodoDestinoId,
          fila.proximoIntentoEn,
          fila.ultimoError,
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
          causa: diagnostico.causa,
          reintentoManualPermitido: diagnostico.reintentoManualPermitido,
          saneamientoMasivoPermitido: diagnostico.saneamientoMasivoPermitido,
        };
      }),
      checkedAt: ahora.toISOString(),
    };
  }

  private async listarInboxPorAlcance(alcance: AlcanceSync) {
    const [total, filas] = await Promise.all([
      this.prisma.syncInbox.count({
        where: { ...alcance, estado: EstadoSyncInbox.ERROR },
      }),
      this.prisma.syncInbox.findMany({
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
          versionEsquema: true,
          ocurridoEn: true,
          recibidoEn: true,
          aplicadoEn: true,
          ultimoError: true,
        },
      }),
    ]);

    return {
      total,
      items: filas.map((fila) => {
        const clasificacion = this.clasificarInbox(fila.ultimoError);
        return {
          ...fila,
          ocurridoEn: fila.ocurridoEn.toISOString(),
          recibidoEn: fila.recibidoEn.toISOString(),
          aplicadoEn: fila.aplicadoEn?.toISOString() ?? null,
          ultimoError: fila.ultimoError?.slice(0, 500) ?? null,
          clasificacion,
          reintentoManualPermitido: clasificacion === 'REQUIERE_REVISION',
        };
      }),
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
        ultimoError: true,
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
      evento.ultimoError,
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

  private async sanearOutboxTransitoriosPorAlcance(
    alcance: AlcanceSync,
    limiteSolicitado: number,
  ) {
    if (!this.entorno.syncHabilitado) {
      throw new BadRequestException(
        'La sincronizacion esta deshabilitada en este nodo',
      );
    }
    const limite = Math.min(
      Math.max(Math.trunc(limiteSolicitado || 10), 1),
      25,
    );
    const peersActivos = await this.peersActivos(alcance);
    if (peersActivos.size === 0) {
      return { revisados: 0, reencolados: 0, eventIds: [], limite };
    }

    const candidatos = await this.prisma.syncOutbox.findMany({
      where: {
        ...alcance,
        estado: EstadoSyncOutbox.ERROR,
        nodoDestinoId: { in: [...peersActivos] },
      },
      orderBy: [{ ultimoIntentoEn: 'asc' }, { id: 'asc' }],
      take: 200,
      select: {
        eventId: true,
        ultimoError: true,
      },
    });
    const elegibles = candidatos
      .filter((fila) => this.esErrorTransitorioTransporte(fila.ultimoError))
      .slice(0, limite)
      .map((fila) => fila.eventId);

    if (elegibles.length === 0) {
      return {
        revisados: candidatos.length,
        reencolados: 0,
        eventIds: [],
        limite,
      };
    }

    const actualizado = await this.prisma.syncOutbox.updateMany({
      where: {
        ...alcance,
        eventId: { in: elegibles },
        estado: EstadoSyncOutbox.ERROR,
      },
      data: {
        estado: EstadoSyncOutbox.PENDIENTE,
        proximoIntentoEn: null,
      },
    });

    return {
      revisados: candidatos.length,
      reencolados: actualizado.count,
      eventIds: elegibles,
      limite,
    };
  }

  private async reintentarInboxPorAlcance(
    eventId: string,
    alcance: AlcanceSync,
  ) {
    if (!this.entorno.syncHabilitado) {
      throw new BadRequestException(
        'La sincronizacion esta deshabilitada en este nodo',
      );
    }

    const fila = await this.prisma.syncInbox.findFirst({
      where: { eventId, ...alcance },
      select: {
        eventId: true,
        nodoOrigenId: true,
        restauranteGlobalId: true,
        sucursalGlobalId: true,
        tipoAgregado: true,
        agregadoGlobalId: true,
        tipoEvento: true,
        versionEsquema: true,
        payload: true,
        payloadHash: true,
        ocurridoEn: true,
        estado: true,
        ultimoError: true,
      },
    });
    if (!fila) throw new NotFoundException('Evento Inbox no encontrado');
    if (fila.estado !== EstadoSyncInbox.ERROR) {
      throw new BadRequestException(
        'Solo se puede reintentar un evento Inbox en ERROR',
      );
    }
    if (this.clasificarInbox(fila.ultimoError) === 'NO_SOPORTADO') {
      throw new BadRequestException(
        'El tipo de evento sigue sin estar soportado; requiere actualizacion del sistema antes de reintentar',
      );
    }

    const evento: EventoSyncWire = {
      eventId: fila.eventId,
      sourceNodeId: fila.nodoOrigenId,
      destinationNodeId: this.entorno.syncNodeId,
      restauranteGlobalId: fila.restauranteGlobalId,
      sucursalGlobalId: fila.sucursalGlobalId,
      aggregateType: fila.tipoAgregado,
      aggregateGlobalId: fila.agregadoGlobalId,
      eventType: fila.tipoEvento,
      schemaVersion: fila.versionEsquema,
      payload: fila.payload,
      payloadHash: fila.payloadHash,
      occurredAt: fila.ocurridoEn.toISOString(),
    };
    const resultado = await this.inbox.recibir(evento);
    const final = await this.prisma.syncInbox.findUnique({
      where: { eventId },
      select: { estado: true, aplicadoEn: true, ultimoError: true },
    });

    return {
      eventId,
      resultado: resultado.status,
      estado: final?.estado ?? EstadoSyncInbox.ERROR,
      aplicadoEn: final?.aplicadoEn?.toISOString() ?? null,
      ultimoError: final?.ultimoError?.slice(0, 500) ?? null,
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
    ultimoError: string | null,
    peersActivos: Set<string>,
    ahora: Date,
  ) {
    const causa = this.clasificarCausaOutbox(ultimoError);
    if (!this.entorno.syncHabilitado) {
      return {
        clasificacion: 'SIN_SYNC' as const,
        causa,
        reintentoManualPermitido: false,
        saneamientoMasivoPermitido: false,
      };
    }
    if (!peersActivos.has(destino)) {
      return {
        clasificacion: 'HISTORICO_DESTINO' as const,
        causa,
        reintentoManualPermitido: false,
        saneamientoMasivoPermitido: false,
      };
    }
    const saneamientoMasivoPermitido = causa === 'TRANSPORTE';
    if (proximoIntentoEn && proximoIntentoEn > ahora) {
      return {
        clasificacion: 'EN_ESPERA' as const,
        causa,
        reintentoManualPermitido: true,
        saneamientoMasivoPermitido,
      };
    }
    return {
      clasificacion: 'REINTENTABLE' as const,
      causa,
      reintentoManualPermitido: true,
      saneamientoMasivoPermitido,
    };
  }

  private clasificarCausaOutbox(ultimoError: string | null) {
    if (this.esErrorTransitorioTransporte(ultimoError))
      return 'TRANSPORTE' as const;
    if (
      ultimoError?.startsWith('HTTP 400:') ||
      ultimoError?.startsWith('HTTP 403:')
    ) {
      return 'RECHAZO_PEER' as const;
    }
    return 'OTRO' as const;
  }

  private esErrorTransitorioTransporte(ultimoError: string | null) {
    if (!ultimoError) return false;
    const texto = ultimoError.toLowerCase();
    return [
      'fetch failed',
      'econnrefused',
      'econnreset',
      'enotfound',
      'etimedout',
      'socket hang up',
      'network',
      'cloud no devolvio resultado para el evento',
      'http 502:',
      'http 503:',
      'http 504:',
    ].some((patron) => texto.includes(patron));
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
