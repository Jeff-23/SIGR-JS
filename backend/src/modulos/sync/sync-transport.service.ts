import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { RolNodoSync } from '@prisma/client';
import { obtenerEntorno } from '../../config/entorno';
import { PrismaService } from '../../prisma/prisma.service';
import { hashClaveSync } from './sync.crypto';
import { SyncInboxService } from './sync-inbox.service';
import { SyncOutboxService } from './sync-outbox.service';
import { EventoSyncWire, ResultadoRecepcionSync } from './sync.types';
import { validarEventoWire } from './sync.validation';

@Injectable()
export class SyncTransportService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SyncTransportService.name);
  private readonly entorno = obtenerEntorno();
  private timer?: NodeJS.Timeout;
  private cicloEnCurso = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: SyncOutboxService,
    private readonly inbox: SyncInboxService,
  ) {}

  async onModuleInit() {
    await this.bootstrapPeerCertificacion();
    if (!this.entorno.syncHabilitado || this.entorno.syncRol !== 'EDGE') return;
    this.timer = setInterval(
      () => void this.cicloUnaVez(),
      this.entorno.syncPollIntervalMs,
    );
    this.timer.unref();
    setTimeout(() => void this.cicloUnaVez(), 1200).unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async cicloUnaVez() {
    if (!this.entorno.syncHabilitado || this.entorno.syncRol !== 'EDGE') {
      return { push: 0, pull: 0, ack: 0 };
    }
    if (this.cicloEnCurso) return { push: 0, pull: 0, ack: 0, busy: true };
    this.cicloEnCurso = true;
    try {
      const push = await this.pushLocalACloud();
      const pull = await this.pullCloudALocal();
      return {
        push: push.enviados,
        pull: pull.recibidos,
        ack: pull.ack,
        fetched: pull.fetched,
        sourceMismatch: pull.sourceMismatch,
        applyErrors: pull.applyErrors,
        applyErrorDetails: pull.applyErrorDetails,
      };
    } finally {
      this.cicloEnCurso = false;
    }
  }

  private async pushLocalACloud() {
    const peerNodeId = this.entorno.syncPeerNodeId!;
    const eventos = await this.outbox.tomarParaEnvio(
      peerNodeId,
      this.entorno.syncBatchSize,
    );
    if (eventos.length === 0) return { enviados: 0 };

    try {
      const respuesta = await this.post<{ results: ResultadoRecepcionSync[] }>(
        '/sync/internal/events',
        { events: eventos.map((e) => this.outbox.aWire(e)) },
      );
      const ok = respuesta.results
        .filter((r) => r.status === 'APPLIED' || r.status === 'DUPLICATE')
        .map((r) => r.eventId);
      await this.outbox.marcarSincronizados(ok);
      const respondidos = new Set(
        respuesta.results.map((resultado) => resultado.eventId),
      );
      for (const resultado of respuesta.results) {
        if (!ok.includes(resultado.eventId)) {
          await this.outbox.marcarError(
            resultado.eventId,
            resultado.error ?? resultado.status,
          );
        }
      }
      for (const evento of eventos) {
        if (!respondidos.has(evento.eventId)) {
          await this.outbox.marcarError(
            evento.eventId,
            'Cloud no devolvio resultado para el evento',
          );
        }
      }
      return { enviados: ok.length };
    } catch (error) {
      const mensaje = mensajeError(error);
      for (const evento of eventos)
        await this.outbox.marcarError(evento.eventId, mensaje);
      this.logger.warn(`Push sync pendiente: ${mensaje}`);
      return { enviados: 0 };
    }
  }

  private async pullCloudALocal() {
    try {
      const respuesta = await this.post<{ events: unknown[] }>(
        '/sync/internal/pull',
        {
          limit: this.entorno.syncBatchSize,
        },
      );
      const ack: string[] = [];
      let recibidos = 0;
      let sourceMismatch = 0;
      let applyErrors = 0;
      const applyErrorDetails: Array<{ eventId: string; eventType: string; status: string; error: string }> = [];
      const fetched = respuesta.events.length;
      for (const bruto of respuesta.events) {
        const evento = validarEventoWire(bruto);
        if (evento.sourceNodeId !== this.entorno.syncPeerNodeId) {
          sourceMismatch += 1;
          this.logger.error(
            `Evento pull ${evento.eventId} viene de ${evento.sourceNodeId}; se esperaba ${this.entorno.syncPeerNodeId}`,
          );
          continue;
        }
        const resultado = await this.inbox.recibir(evento);
        if (
          resultado.status === 'APPLIED' ||
          resultado.status === 'DUPLICATE'
        ) {
          ack.push(evento.eventId);
          recibidos += 1;
        } else {
          applyErrors += 1;
          applyErrorDetails.push({
            eventId: evento.eventId,
            eventType: evento.eventType,
            status: resultado.status,
            error: resultado.error ?? '',
          });
          this.logger.error(
            `Evento pull ${evento.eventId} (${evento.eventType}) no aplicado: ${resultado.status} ${resultado.error ?? ''}`,
          );
        }
      }
      if (ack.length > 0)
        await this.post('/sync/internal/ack', { eventIds: ack });
      return { recibidos, ack: ack.length, fetched, sourceMismatch, applyErrors, applyErrorDetails };
    } catch (error) {
      this.logger.warn(`Pull sync pendiente: ${mensajeError(error)}`);
      return {
        recibidos: 0,
        ack: 0,
        fetched: 0,
        sourceMismatch: 0,
        applyErrors: 0,
        applyErrorDetails: [],
        pullError: mensajeError(error),
      };
    }
  }

  private async post<T = unknown>(ruta: string, body: unknown): Promise<T> {
    const base = this.entorno.syncPeerUrl!.replace(/\/$/, '');
    const respuesta = await fetch(`${base}${ruta}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-sigr-sync-node': this.entorno.syncNodeId,
        'x-sigr-sync-key': this.entorno.syncPeerKey!,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    if (!respuesta.ok) {
      const detalle = (await respuesta.text()).slice(0, 500);
      throw new Error(`HTTP ${respuesta.status}: ${detalle}`);
    }
    return (await respuesta.json()) as T;
  }

  private async bootstrapPeerCertificacion() {
    if (
      !this.entorno.syncHabilitado ||
      this.entorno.syncRol !== 'CLOUD' ||
      !this.entorno.syncCertificationEnabled ||
      !this.entorno.syncBootstrapPeerNodeId ||
      !this.entorno.syncBootstrapPeerKey
    ) {
      return;
    }
    await this.prisma.syncPeer.upsert({
      where: { nodeId: this.entorno.syncBootstrapPeerNodeId },
      update: {
        claveHash: hashClaveSync(this.entorno.syncBootstrapPeerKey),
        rol: RolNodoSync.EDGE,
        activo: true,
      },
      create: {
        nodeId: this.entorno.syncBootstrapPeerNodeId,
        nombre: 'EDGE certificacion Sprint 48D',
        rol: RolNodoSync.EDGE,
        claveHash: hashClaveSync(this.entorno.syncBootstrapPeerKey),
      },
    });
  }
}

function mensajeError(error: unknown) {
  return error instanceof Error
    ? error.message.slice(0, 900)
    : 'Error de transporte sync';
}
