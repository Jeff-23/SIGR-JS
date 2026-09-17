import { Injectable } from '@nestjs/common';
import { EstadoSyncOutbox, Prisma, SyncOutbox } from '@prisma/client';
import { obtenerEntorno } from '../../config/entorno';
import { PrismaService } from '../../prisma/prisma.service';
import { hashPayload } from './sync.crypto';
import { CrearEventoSync, EventoSyncWire } from './sync.types';

@Injectable()
export class SyncOutboxService {
  private readonly entorno = obtenerEntorno();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Este metodo puede recibir Prisma.TransactionClient para que el evento se
   * escriba en la MISMA transaccion que la operacion de negocio (outbox real).
   */
  async encolar(
    evento: CrearEventoSync,
    cliente: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<SyncOutbox> {
    const payloadHash = hashPayload(evento.payload);
    return cliente.syncOutbox.create({
      data: {
        nodoOrigenId: this.entorno.syncNodeId,
        nodoDestinoId: evento.destinationNodeId,
        restauranteGlobalId: evento.restauranteGlobalId ?? null,
        sucursalGlobalId: evento.sucursalGlobalId ?? null,
        tipoAgregado: evento.aggregateType,
        agregadoGlobalId: evento.aggregateGlobalId ?? null,
        tipoEvento: evento.eventType,
        versionEsquema: evento.schemaVersion ?? 1,
        payload: evento.payload,
        payloadHash,
        ocurridoEn: evento.occurredAt ?? new Date(),
      },
    });
  }

  async tomarParaEnvio(destinoNodeId: string, limite: number) {
    const ahora = new Date();
    const leaseExpirado = new Date(
      ahora.getTime() - Math.max(this.entorno.syncPollIntervalMs * 3, 15000),
    );

    // Claim atomico por fila. Antes se usaba una transaccion SERIALIZABLE para
    // seleccionar + marcar todo el lote. En la topologia hibrida puede haber un
    // ciclo automatico y una certificacion/manual muy proximos; si la transaccion
    // aborta, el caller solo ve un pull vacio y el evento queda PENDIENTE.
    // Aqui cada fila se reclama con updateMany condicionado por su estado original.
    const candidatos = await this.prisma.syncOutbox.findMany({
      where: {
        nodoDestinoId: destinoNodeId,
        OR: [
          { estado: EstadoSyncOutbox.PENDIENTE },
          {
            estado: EstadoSyncOutbox.ERROR,
            OR: [
              { proximoIntentoEn: null },
              { proximoIntentoEn: { lte: ahora } },
            ],
          },
          {
            estado: EstadoSyncOutbox.ENVIANDO,
            ultimoIntentoEn: { lte: leaseExpirado },
          },
        ],
      },
      orderBy: { id: 'asc' },
      take: limite,
    });

    const reclamados: SyncOutbox[] = [];
    for (const candidato of candidatos) {
      const condicionEstado: Prisma.SyncOutboxWhereInput =
        candidato.estado === EstadoSyncOutbox.ENVIANDO
          ? {
              estado: EstadoSyncOutbox.ENVIANDO,
              ultimoIntentoEn: candidato.ultimoIntentoEn,
            }
          : { estado: candidato.estado };

      const claim = await this.prisma.syncOutbox.updateMany({
        where: {
          id: candidato.id,
          nodoDestinoId: destinoNodeId,
          ...condicionEstado,
        },
        data: {
          estado: EstadoSyncOutbox.ENVIANDO,
          ultimoIntentoEn: ahora,
          intentos: { increment: 1 },
          ultimoError: null,
        },
      });
      if (claim.count !== 1) continue;

      const actualizado = await this.prisma.syncOutbox.findUnique({
        where: { id: candidato.id },
      });
      if (actualizado) reclamados.push(actualizado);
    }
    return reclamados;
  }

  /**
   * Entrega pull Cloud -> EDGE con semantica at-least-once.
   * No reclama ni cambia el estado antes de que EDGE confirme el ACK.
   * Esto evita carreras entre ciclos automaticos/manuales y es seguro porque
   * SyncInbox es idempotente por eventId.
   */
  async listarParaPull(destinoNodeId: string, limite: number) {
    const ahora = new Date();
    return this.prisma.syncOutbox.findMany({
      where: {
        nodoDestinoId: destinoNodeId,
        OR: [
          { estado: EstadoSyncOutbox.PENDIENTE },
          {
            estado: EstadoSyncOutbox.ERROR,
            OR: [
              { proximoIntentoEn: null },
              { proximoIntentoEn: { lte: ahora } },
            ],
          },
          // Compatibilidad con eventos que quedaron ENVIANDO por versiones
          // anteriores: pueden reentregarse; el Inbox evita duplicados.
          { estado: EstadoSyncOutbox.ENVIANDO },
        ],
      },
      orderBy: { id: 'asc' },
      take: limite,
    });
  }

  async marcarSincronizados(eventIds: string[]) {
    if (eventIds.length === 0) return;
    await this.prisma.syncOutbox.updateMany({
      where: { eventId: { in: eventIds } },
      data: {
        estado: EstadoSyncOutbox.SINCRONIZADO,
        sincronizadoEn: new Date(),
        proximoIntentoEn: null,
        ultimoError: null,
      },
    });
  }

  async marcarSincronizadosDeDestino(
    destinationNodeId: string,
    eventIds: string[],
  ) {
    if (eventIds.length === 0) return 0;
    const resultado = await this.prisma.syncOutbox.updateMany({
      where: { nodoDestinoId: destinationNodeId, eventId: { in: eventIds } },
      data: {
        estado: EstadoSyncOutbox.SINCRONIZADO,
        sincronizadoEn: new Date(),
        proximoIntentoEn: null,
        ultimoError: null,
      },
    });
    return resultado.count;
  }

  async marcarError(eventId: string, mensaje: string) {
    const actual = await this.prisma.syncOutbox.findUnique({
      where: { eventId },
    });
    if (!actual || actual.estado === EstadoSyncOutbox.SINCRONIZADO) return;
    const demora = Math.min(300000, 2000 * 2 ** Math.min(actual.intentos, 7));
    await this.prisma.syncOutbox.update({
      where: { eventId },
      data: {
        estado: EstadoSyncOutbox.ERROR,
        ultimoError: mensaje.slice(0, 1000),
        proximoIntentoEn: new Date(Date.now() + demora),
      },
    });
  }

  aWire(evento: SyncOutbox): EventoSyncWire {
    return {
      eventId: evento.eventId,
      sourceNodeId: evento.nodoOrigenId,
      destinationNodeId: evento.nodoDestinoId,
      restauranteGlobalId: evento.restauranteGlobalId,
      sucursalGlobalId: evento.sucursalGlobalId,
      aggregateType: evento.tipoAgregado,
      aggregateGlobalId: evento.agregadoGlobalId,
      eventType: evento.tipoEvento,
      schemaVersion: evento.versionEsquema,
      payload: evento.payload as Prisma.InputJsonValue,
      // El hash wire debe describir exactamente el JSON que sale de Postgres.
      // Recalcular aqui evita diferencias entre el objeto previo a persistencia y
      // la representacion JSON realmente almacenada/reenviada.
      payloadHash: hashPayload(evento.payload),
      occurredAt: evento.ocurridoEn.toISOString(),
    };
  }
}
