import { Prisma } from '@prisma/client';

export type EventoSyncWire = {
  eventId: string;
  sourceNodeId: string;
  destinationNodeId: string;
  restauranteGlobalId?: string | null;
  sucursalGlobalId?: string | null;
  aggregateType: string;
  aggregateGlobalId?: string | null;
  eventType: string;
  schemaVersion: number;
  payload: Prisma.InputJsonValue;
  payloadHash: string;
  occurredAt: string;
};

export type ResultadoRecepcionSync = {
  eventId: string;
  status: 'APPLIED' | 'DUPLICATE' | 'CONFLICT' | 'ERROR';
  error?: string;
};

export type CrearEventoSync = {
  destinationNodeId: string;
  restauranteGlobalId?: string | null;
  sucursalGlobalId?: string | null;
  aggregateType: string;
  aggregateGlobalId?: string | null;
  eventType: string;
  schemaVersion?: number;
  payload: Prisma.InputJsonValue;
  occurredAt?: Date;
};
