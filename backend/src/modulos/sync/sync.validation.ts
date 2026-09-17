import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EventoSyncWire } from './sync.types';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NODE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,119}$/;
const TIPO = /^[A-Z0-9][A-Z0-9._:-]{1,139}$/i;

export function validarEventoWire(valor: unknown): EventoSyncWire {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) {
    throw new BadRequestException('Evento sync invalido');
  }
  const e = valor as Record<string, unknown>;
  texto(e.eventId, 'eventId', UUID);
  texto(e.sourceNodeId, 'sourceNodeId', NODE_ID);
  texto(e.destinationNodeId, 'destinationNodeId', NODE_ID);
  opcionalUuid(e.restauranteGlobalId, 'restauranteGlobalId');
  opcionalUuid(e.sucursalGlobalId, 'sucursalGlobalId');
  texto(e.aggregateType, 'aggregateType', TIPO);
  opcionalUuid(e.aggregateGlobalId, 'aggregateGlobalId');
  texto(e.eventType, 'eventType', TIPO);
  texto(e.payloadHash, 'payloadHash', /^[0-9a-f]{64}$/i);
  if (!Number.isInteger(e.schemaVersion) || Number(e.schemaVersion) < 1) {
    throw new BadRequestException('schemaVersion invalido');
  }
  if (e.payload === undefined)
    throw new BadRequestException('payload es obligatorio');
  const occurredAt = new Date(String(e.occurredAt));
  if (Number.isNaN(occurredAt.getTime()))
    throw new BadRequestException('occurredAt invalido');

  return {
    eventId: String(e.eventId),
    sourceNodeId: String(e.sourceNodeId),
    destinationNodeId: String(e.destinationNodeId),
    restauranteGlobalId:
      (e.restauranteGlobalId as string | null | undefined) ?? null,
    sucursalGlobalId: (e.sucursalGlobalId as string | null | undefined) ?? null,
    aggregateType: String(e.aggregateType),
    aggregateGlobalId:
      (e.aggregateGlobalId as string | null | undefined) ?? null,
    eventType: String(e.eventType),
    schemaVersion: Number(e.schemaVersion),
    payload: e.payload as Prisma.InputJsonValue,
    payloadHash: String(e.payloadHash).toLowerCase(),
    occurredAt: occurredAt.toISOString(),
  };
}

function texto(valor: unknown, campo: string, patron: RegExp) {
  if (typeof valor !== 'string' || !patron.test(valor)) {
    throw new BadRequestException(`${campo} invalido`);
  }
}

function opcionalUuid(valor: unknown, campo: string) {
  if (valor === undefined || valor === null || valor === '') return;
  texto(valor, campo, UUID);
}
