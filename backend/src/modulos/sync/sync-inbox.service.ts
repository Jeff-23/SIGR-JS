import { Injectable } from '@nestjs/common';
import { EstadoSyncInbox, Prisma, TipoConflictoSync } from '@prisma/client';
import { obtenerEntorno } from '../../config/entorno';
import { PrismaService } from '../../prisma/prisma.service';
import { hashPayload } from './sync.crypto';
import { EventoSyncWire, ResultadoRecepcionSync } from './sync.types';
import { SyncBusinessApplyService } from './sync-business-apply.service';
import { SyncConflictService } from './sync-conflict.service';

@Injectable()
export class SyncInboxService {
  private readonly entorno = obtenerEntorno();

  constructor(
    private readonly prisma: PrismaService,
    private readonly businessApply: SyncBusinessApplyService,
    private readonly conflictos: SyncConflictService,
  ) {}

  async recibir(evento: EventoSyncWire): Promise<ResultadoRecepcionSync> {
    if (evento.destinationNodeId !== this.entorno.syncNodeId) {
      return {
        eventId: evento.eventId,
        status: 'ERROR',
        error: `Evento destinado a ${evento.destinationNodeId}, nodo actual ${this.entorno.syncNodeId}`,
      };
    }
    // El hash autoritativo del Inbox se calcula sobre el payload JSON que este
    // nodo realmente recibio. El hash que viene en wire es informativo: distintas
    // representaciones JSON/Prisma pueden producir una huella distinta aun cuando
    // el contenido recibido sea el mismo. La proteccion contra colisiones se hace
    // con hashCalculado + eventId, de modo que el mismo eventId con un payload
    // realmente diferente sigue siendo rechazado.
    const hashCalculado = hashPayload(evento.payload);

    // Persistimos primero la recepcion. Antes esta fila se creaba dentro de la
    // misma transaccion SERIALIZABLE del apply; si el apply/commit fallaba, la
    // fila ERROR tambien se perdia y el transporte solo mostraba applyErrors.
    const existente = await this.prisma.syncInbox.findUnique({
      where: { eventId: evento.eventId },
    });
    if (existente) {
      if (existente.payloadHash !== hashCalculado) {
        const error = 'eventId reutilizado con otro payload';
        await this.conflictos.registrar(
          evento,
          TipoConflictoSync.COLISION_EVENT_ID,
          error,
          hashCalculado,
          existente.payloadHash,
        );
        return { eventId: evento.eventId, status: 'CONFLICT', error };
      }
      if (existente.estado === EstadoSyncInbox.APLICADO) {
        return { eventId: evento.eventId, status: 'DUPLICATE' };
      }
    } else {
      try {
        await this.prisma.syncInbox.create({
          data: {
            eventId: evento.eventId,
            nodoOrigenId: evento.sourceNodeId,
            restauranteGlobalId: evento.restauranteGlobalId ?? null,
            sucursalGlobalId: evento.sucursalGlobalId ?? null,
            tipoAgregado: evento.aggregateType,
            agregadoGlobalId: evento.aggregateGlobalId ?? null,
            tipoEvento: evento.eventType,
            versionEsquema: evento.schemaVersion,
            payload: evento.payload,
            payloadHash: hashCalculado,
            ocurridoEn: new Date(evento.occurredAt),
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          const repetido = await this.prisma.syncInbox.findUnique({
            where: { eventId: evento.eventId },
          });
          if (repetido?.payloadHash === hashCalculado) {
            if (repetido.estado === EstadoSyncInbox.APLICADO) {
              return { eventId: evento.eventId, status: 'DUPLICATE' };
            }
          } else {
            const errorColision = 'eventId reutilizado con otro payload';
            await this.conflictos.registrar(
              evento,
              TipoConflictoSync.COLISION_EVENT_ID,
              errorColision,
              hashCalculado,
              repetido?.payloadHash ?? null,
            );
            return {
              eventId: evento.eventId,
              status: 'CONFLICT',
              error: errorColision,
            };
          }
        } else {
          return {
            eventId: evento.eventId,
            status: 'ERROR',
            error: error instanceof Error ? error.message.slice(0, 900) : 'Error creando inbox',
          };
        }
      }
    }

    try {
      const resultado = await this.prisma.transaccionSerializable(async (tx) =>
        this.aplicarExistente(tx, evento),
      );
      if (resultado.status === 'APPLIED') {
        await this.conflictos.resolverAutomaticamente(evento.eventId, hashCalculado);
      } else if (resultado.status === 'ERROR') {
        await this.conflictos.registrar(
          evento,
          TipoConflictoSync.APLICACION_EVENTO,
          resultado.error ?? 'Error aplicando evento',
          hashCalculado,
          hashCalculado,
        );
      }
      return resultado;
    } catch (error) {
      const mensaje =
        error instanceof Error ? error.message.slice(0, 900) : 'Error transaccional aplicando evento';
      // Guardar el error fuera de la transaccion fallida es deliberado: asi el
      // diagnostico y el reintento sobreviven al rollback.
      await this.prisma.syncInbox.update({
        where: { eventId: evento.eventId },
        data: { estado: EstadoSyncInbox.ERROR, ultimoError: mensaje },
      }).catch(() => undefined);
      await this.conflictos.registrar(
        evento,
        TipoConflictoSync.APLICACION_EVENTO,
        mensaje,
        hashCalculado,
        hashCalculado,
      ).catch(() => undefined);
      return { eventId: evento.eventId, status: 'ERROR', error: mensaje };
    }
  }

  private async aplicarExistente(
    tx: Prisma.TransactionClient,
    evento: EventoSyncWire,
  ): Promise<ResultadoRecepcionSync> {
    const eventId = evento.eventId;
    try {
      if (evento.eventType === 'SYNC.PING') {
        await tx.syncInbox.update({
          where: { eventId },
          data: {
            estado: EstadoSyncInbox.APLICADO,
            aplicadoEn: new Date(),
            ultimoError: null,
          },
        });
        return { eventId, status: 'APPLIED' };
      }

      const soportado = await this.businessApply.aplicar(tx, evento);
      if (!soportado) {
        const error = `Tipo de evento no soportado todavia: ${evento.eventType}`;
        await tx.syncInbox.update({
          where: { eventId },
          data: { estado: EstadoSyncInbox.ERROR, ultimoError: error },
        });
        return { eventId, status: 'ERROR', error };
      }

      await tx.syncInbox.update({
        where: { eventId },
        data: {
          estado: EstadoSyncInbox.APLICADO,
          aplicadoEn: new Date(),
          ultimoError: null,
        },
      });
      return { eventId, status: 'APPLIED' };
    } catch (error) {
      const mensaje =
        error instanceof Error ? error.message.slice(0, 900) : 'Error aplicando evento';
      await tx.syncInbox.update({
        where: { eventId },
        data: { estado: EstadoSyncInbox.ERROR, ultimoError: mensaje },
      });
      return { eventId, status: 'ERROR', error: mensaje };
    }
  }
}
