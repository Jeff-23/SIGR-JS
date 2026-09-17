import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { EstadoSyncInbox, EstadoSyncOutbox } from '@prisma/client';
import { obtenerEntorno } from '../../config/entorno';
import { PrismaService } from '../../prisma/prisma.service';
import { SyncCertGuard } from './sync-cert.guard';
import { SyncInboxService } from './sync-inbox.service';
import { SyncOutboxService } from './sync-outbox.service';
import { SyncPeerGuard, SyncRequest } from './sync-peer.guard';
import { SyncTransportService } from './sync-transport.service';
import { validarEventoWire } from './sync.validation';
import { SyncBusinessCertService } from './sync-business-cert.service';
import { SyncConflictService } from './sync-conflict.service';

@Controller('sync/internal')
export class SyncController {
  private readonly entorno = obtenerEntorno();

  constructor(
    private readonly prisma: PrismaService,
    private readonly inbox: SyncInboxService,
    private readonly outbox: SyncOutboxService,
    private readonly transport: SyncTransportService,
    private readonly businessCert: SyncBusinessCertService,
    private readonly conflictos: SyncConflictService,
  ) {}

  @Post('events')
  @UseGuards(SyncPeerGuard)
  async recibir(@Body() body: unknown, @Req() req: SyncRequest) {
    const peerNodeId = req.syncPeerNodeId!;
    const eventos = lote(body, this.entorno.syncBatchSize);
    const results = [];
    for (const bruto of eventos) {
      const evento = validarEventoWire(bruto);
      if (evento.sourceNodeId !== peerNodeId) {
        throw new BadRequestException(
          'sourceNodeId no coincide con el nodo autenticado',
        );
      }
      if (evento.destinationNodeId !== this.entorno.syncNodeId) {
        throw new BadRequestException(
          'destinationNodeId no corresponde a este Cloud',
        );
      }
      if (
        req.syncPeerRestauranteGlobalId &&
        evento.restauranteGlobalId !== req.syncPeerRestauranteGlobalId
      ) {
        throw new BadRequestException(
          'restauranteGlobalId fuera del alcance del peer',
        );
      }
      if (
        req.syncPeerSucursalGlobalId &&
        evento.sucursalGlobalId !== req.syncPeerSucursalGlobalId
      ) {
        throw new BadRequestException(
          'sucursalGlobalId fuera del alcance del peer',
        );
      }
      results.push(await this.inbox.recibir(evento));
    }
    return { results };
  }

  @Post('pull')
  @UseGuards(SyncPeerGuard)
  async pull(@Body() body: unknown, @Req() req: SyncRequest) {
    const limite = limiteSolicitado(body, this.entorno.syncBatchSize);
    // Pull es at-least-once: Cloud no marca el evento como "tomado" antes
    // de recibir ACK. Si EDGE repite el pull, SyncInbox deduplica por eventId.
    const eventos = await this.outbox.listarParaPull(
      req.syncPeerNodeId!,
      limite,
    );
    return { events: eventos.map((evento) => this.outbox.aWire(evento)) };
  }

  @Post('ack')
  @UseGuards(SyncPeerGuard)
  async ack(@Body() body: unknown, @Req() req: SyncRequest) {
    const eventIds = idsSolicitados(body, this.entorno.syncBatchSize);
    const acknowledged = await this.outbox.marcarSincronizadosDeDestino(
      req.syncPeerNodeId!,
      eventIds,
    );
    return { acknowledged };
  }

  @Post('certification/enqueue')
  @UseGuards(SyncCertGuard)
  async certEnqueue(@Body() body: unknown) {
    const destino = destinoCert(body);
    const evento = await this.outbox.encolar({
      destinationNodeId: destino,
      aggregateType: 'SYNC',
      eventType: 'SYNC.PING',
      payload: {
        sprint: '48D-1',
        from: this.entorno.syncNodeId,
        to: destino,
        nonce: randomUUID(),
      },
    });
    return { event: this.outbox.aWire(evento) };
  }

  @Post('certification/cycle')
  @UseGuards(SyncCertGuard)
  certCycle() {
    return this.transport.cicloUnaVez();
  }

  @Get('certification/status')
  @UseGuards(SyncCertGuard)
  async certStatus(@Query('eventId') eventId?: string) {
    if (eventId) {
      const [outbox, inbox] = await Promise.all([
        this.prisma.syncOutbox.findUnique({ where: { eventId } }),
        this.prisma.syncInbox.findUnique({ where: { eventId } }),
      ]);
      return {
        nodeId: this.entorno.syncNodeId,
        role: this.entorno.syncRol,
        outbox: outbox
          ? {
              estado: outbox.estado,
              intentos: outbox.intentos,
              destino: outbox.nodoDestinoId,
            }
          : null,
        inbox: inbox
          ? {
              estado: inbox.estado,
              origen: inbox.nodoOrigenId,
              payloadHash: inbox.payloadHash,
            }
          : null,
      };
    }
    const [outboxPendiente, outboxSync, inboxAplicado, inboxError] =
      await Promise.all([
        this.prisma.syncOutbox.count({
          where: {
            estado: {
              in: [
                EstadoSyncOutbox.PENDIENTE,
                EstadoSyncOutbox.ENVIANDO,
                EstadoSyncOutbox.ERROR,
              ],
            },
          },
        }),
        this.prisma.syncOutbox.count({
          where: { estado: EstadoSyncOutbox.SINCRONIZADO },
        }),
        this.prisma.syncInbox.count({
          where: { estado: EstadoSyncInbox.APLICADO },
        }),
        this.prisma.syncInbox.count({
          where: { estado: EstadoSyncInbox.ERROR },
        }),
      ]);
    return {
      nodeId: this.entorno.syncNodeId,
      role: this.entorno.syncRol,
      outboxPendiente,
      outboxSync,
      inboxAplicado,
      inboxError,
    };
  }
  @Post('certification/business/setup')
  @UseGuards(SyncCertGuard)
  certBusinessSetup(@Body() body: unknown) {
    return this.businessCert.prepararReferencias(idsBusiness(body));
  }

  @Post('certification/business/create-edge-flow')
  @UseGuards(SyncCertGuard)
  certBusinessCreate(@Body() body: unknown) {
    return this.businessCert.crearFlujoEdge(idsBusiness(body));
  }

  @Post('certification/business/update-cloud')
  @UseGuards(SyncCertGuard)
  certBusinessUpdateCloud(@Body() body: unknown) {
    const data = objetoBody(body);
    return this.businessCert.actualizarDesdeCloud(
      uuidBody(data.comandaGlobalId, 'comandaGlobalId'),
      uuidBody(data.domicilioGlobalId, 'domicilioGlobalId'),
    );
  }

  @Get('certification/business/status')
  @UseGuards(SyncCertGuard)
  certBusinessStatus(
    @Query('pedidoGlobalId') pedidoGlobalId?: string,
    @Query('comandaGlobalId') comandaGlobalId?: string,
    @Query('domicilioGlobalId') domicilioGlobalId?: string,
  ) {
    return this.businessCert.estado(
      uuidBody(pedidoGlobalId, 'pedidoGlobalId'),
      uuidBody(comandaGlobalId, 'comandaGlobalId'),
      uuidBody(domicilioGlobalId, 'domicilioGlobalId'),
    );
  }


  @Post('certification/money/setup')
  @UseGuards(SyncCertGuard)
  certMoneySetup(@Body() body: unknown) {
    return this.businessCert.prepararReferencias(idsMoney(body));
  }

  @Post('certification/money/create-edge-flow')
  @UseGuards(SyncCertGuard)
  certMoneyCreate(@Body() body: unknown) {
    return this.businessCert.crearFlujoDineroEdge(idsMoney(body));
  }


  @Post('certification/money/requeue')
  @UseGuards(SyncCertGuard)
  certMoneyRequeue(@Body() body: unknown) {
    const data = objetoBody(body);
    return this.businessCert.reencolarDinero(
      uuidBody(data.ventaGlobalId, 'ventaGlobalId'),
      uuidBody(data.cajaGlobalId, 'cajaGlobalId'),
    );
  }

  @Post('certification/money/update-cloud')
  @UseGuards(SyncCertGuard)
  certMoneyUpdateCloud(@Body() body: unknown) {
    const data = objetoBody(body);
    return this.businessCert.movimientoDesdeCloud(
      uuidBody(data.cajaGlobalId, 'cajaGlobalId'),
      uuidBody(data.usuarioGlobalId, 'usuarioGlobalId'),
    );
  }

  @Get('certification/money/status')
  @UseGuards(SyncCertGuard)
  certMoneyStatus(
    @Query('ventaGlobalId') ventaGlobalId?: string,
    @Query('cajaGlobalId') cajaGlobalId?: string,
  ) {
    return this.businessCert.estadoDinero(
      uuidBody(ventaGlobalId, 'ventaGlobalId'),
      uuidBody(cajaGlobalId, 'cajaGlobalId'),
    );
  }



  @Post('certification/loyalty/setup')
  @UseGuards(SyncCertGuard)
  certLoyaltySetup(@Body() body: unknown) {
    return this.businessCert.prepararFidelizacion(idsLoyalty(body));
  }

  @Post('certification/loyalty/create-edge-flow')
  @UseGuards(SyncCertGuard)
  certLoyaltyCreate(@Body() body: unknown) {
    return this.businessCert.crearFlujoFidelizacionEdge(idsLoyalty(body));
  }

  @Post('certification/loyalty/requeue')
  @UseGuards(SyncCertGuard)
  certLoyaltyRequeue(@Body() body: unknown) {
    return this.businessCert.reencolarFidelizacion(idsLoyalty(body));
  }

  @Post('certification/loyalty/update-cloud')
  @UseGuards(SyncCertGuard)
  certLoyaltyUpdateCloud(@Body() body: unknown) {
    return this.businessCert.actualizarFidelizacionCloud(idsLoyalty(body));
  }

  @Get('certification/loyalty/status')
  @UseGuards(SyncCertGuard)
  certLoyaltyStatus(@Query('clienteGlobalId') clienteGlobalId?: string) {
    return this.businessCert.estadoFidelizacion(uuidBody(clienteGlobalId, 'clienteGlobalId'));
  }


  @Post('certification/masters/setup')
  @UseGuards(SyncCertGuard)
  certMastersSetup(@Body() body: unknown) {
    return this.businessCert.prepararMaestros(idsMasters(body));
  }

  @Post('certification/masters/create-edge-flow')
  @UseGuards(SyncCertGuard)
  certMastersCreate(@Body() body: unknown) {
    return this.businessCert.crearFlujoMaestrosEdge(idsMasters(body));
  }

  @Post('certification/masters/requeue')
  @UseGuards(SyncCertGuard)
  certMastersRequeue(@Body() body: unknown) {
    return this.businessCert.reencolarMaestros(idsMasters(body));
  }

  @Post('certification/masters/update-cloud')
  @UseGuards(SyncCertGuard)
  certMastersUpdateCloud(@Body() body: unknown) {
    return this.businessCert.actualizarMaestrosCloud(idsMasters(body));
  }

  @Get('certification/masters/status')
  @UseGuards(SyncCertGuard)
  certMastersStatus(
    @Query('restauranteGlobalId') restauranteGlobalId?: string,
    @Query('sucursalGlobalId') sucursalGlobalId?: string,
    @Query('categoriaGlobalId') categoriaGlobalId?: string,
    @Query('productoGlobalId') productoGlobalId?: string,
    @Query('zonaGlobalId') zonaGlobalId?: string,
    @Query('mesaGlobalId') mesaGlobalId?: string,
  ) {
    return this.businessCert.estadoMaestros({
      restauranteGlobalId: uuidBody(restauranteGlobalId, 'restauranteGlobalId'),
      sucursalGlobalId: uuidBody(sucursalGlobalId, 'sucursalGlobalId'),
      categoriaGlobalId: uuidBody(categoriaGlobalId, 'categoriaGlobalId'),
      productoGlobalId: uuidBody(productoGlobalId, 'productoGlobalId'),
      zonaGlobalId: uuidBody(zonaGlobalId, 'zonaGlobalId'),
      mesaGlobalId: uuidBody(mesaGlobalId, 'mesaGlobalId'),
    });
  }


  @Post('certification/security/setup')
  @UseGuards(SyncCertGuard)
  certSecuritySetup(@Body() body: unknown) {
    return this.businessCert.prepararSeguridad(idsSecurity(body));
  }

  @Post('certification/security/create-edge-flow')
  @UseGuards(SyncCertGuard)
  certSecurityCreate(@Body() body: unknown) {
    return this.businessCert.crearFlujoSeguridadEdge(idsSecurity(body));
  }

  @Post('certification/security/requeue')
  @UseGuards(SyncCertGuard)
  certSecurityRequeue(@Body() body: unknown) {
    return this.businessCert.reencolarSeguridad(idsSecurity(body));
  }

  @Post('certification/security/update-cloud')
  @UseGuards(SyncCertGuard)
  certSecurityUpdateCloud(@Body() body: unknown) {
    return this.businessCert.actualizarSeguridadCloud(idsSecurity(body));
  }

  @Get('certification/security/status')
  @UseGuards(SyncCertGuard)
  certSecurityStatus(
    @Query('restauranteGlobalId') restauranteGlobalId?: string,
    @Query('sucursalGlobalId') sucursalGlobalId?: string,
    @Query('usuarioGlobalId') usuarioGlobalId?: string,
  ) {
    return this.businessCert.estadoSeguridad({
      restauranteGlobalId: uuidBody(restauranteGlobalId, 'restauranteGlobalId'),
      sucursalGlobalId: uuidBody(sucursalGlobalId, 'sucursalGlobalId'),
      usuarioGlobalId: uuidBody(usuarioGlobalId, 'usuarioGlobalId'),
    });
  }


  @Post('certification/config/setup')
  @UseGuards(SyncCertGuard)
  certConfigSetup(@Body() body: unknown) {
    return this.businessCert.prepararConfiguracion(idsConfig(body));
  }

  @Post('certification/config/create-edge-flow')
  @UseGuards(SyncCertGuard)
  certConfigCreate(@Body() body: unknown) {
    return this.businessCert.crearFlujoConfiguracionEdge(idsConfig(body));
  }

  @Post('certification/config/requeue')
  @UseGuards(SyncCertGuard)
  certConfigRequeue(@Body() body: unknown) {
    return this.businessCert.reencolarConfiguracion(idsConfig(body));
  }

  @Post('certification/config/update-cloud')
  @UseGuards(SyncCertGuard)
  certConfigUpdateCloud(@Body() body: unknown) {
    return this.businessCert.actualizarConfiguracionCloud(idsConfig(body));
  }

  @Get('certification/config/status')
  @UseGuards(SyncCertGuard)
  certConfigStatus(
    @Query('restauranteGlobalId') restauranteGlobalId?: string,
    @Query('sucursalGlobalId') sucursalGlobalId?: string,
  ) {
    return this.businessCert.estadoConfiguracion({
      restauranteGlobalId: uuidBody(restauranteGlobalId, 'restauranteGlobalId'),
      sucursalGlobalId: uuidBody(sucursalGlobalId, 'sucursalGlobalId'),
    });
  }

  @Post('certification/conflicts/create')
  @UseGuards(SyncCertGuard)
  async certConflictsCreate(@Body() body: unknown) {
    const data = objetoBody(body);
    const eventId = uuidBody(data.eventId, 'eventId');
    const errorEventId = uuidBody(data.errorEventId, 'errorEventId');
    const ahora = new Date().toISOString();
    const base = {
      sourceNodeId: 'cert-48d2h-source',
      destinationNodeId: this.entorno.syncNodeId,
      aggregateType: 'SYNC_CERT',
      aggregateGlobalId: null,
      restauranteGlobalId: null,
      sucursalGlobalId: null,
      schemaVersion: 1,
      payloadHash: 'wire-hash-certificacion',
      occurredAt: ahora,
    };

    const primero = await this.inbox.recibir({
      ...base,
      eventId,
      eventType: 'SYNC.PING',
      payload: { sprint: '48D-2H', version: 1 },
    });
    const colision = await this.inbox.recibir({
      ...base,
      eventId,
      eventType: 'SYNC.PING',
      payload: { sprint: '48D-2H', version: 2 },
    });
    const errorAplicacion = await this.inbox.recibir({
      ...base,
      eventId: errorEventId,
      eventType: 'SYNC.CERT.UNSUPPORTED',
      payload: { sprint: '48D-2H', errorControlado: true },
    });

    return { primero, colision, errorAplicacion };
  }

  @Get('certification/conflicts/status')
  @UseGuards(SyncCertGuard)
  async certConflictsStatus(
    @Query('eventId') eventId?: string,
    @Query('errorEventId') errorEventId?: string,
  ) {
    const principal = uuidBody(eventId, 'eventId');
    const errorId = uuidBody(errorEventId, 'errorEventId');
    const [inboxPrincipal, inboxError, conflictos] = await Promise.all([
      this.prisma.syncInbox.findUnique({ where: { eventId: principal } }),
      this.prisma.syncInbox.findUnique({ where: { eventId: errorId } }),
      this.prisma.syncConflicto.findMany({
        where: { eventId: { in: [principal, errorId] } },
        orderBy: { creadoEn: 'asc' },
      }),
    ]);
    return {
      nodeId: this.entorno.syncNodeId,
      inboxPrincipal: inboxPrincipal
        ? { estado: inboxPrincipal.estado, payloadHash: inboxPrincipal.payloadHash }
        : null,
      inboxError: inboxError
        ? { estado: inboxError.estado, ultimoError: inboxError.ultimoError }
        : null,
      conflictos: conflictos.map((c) => ({
        conflictoId: c.conflictoId,
        eventId: c.eventId,
        tipo: c.tipo,
        estado: c.estado,
        nodoOrigenId: c.nodoOrigenId,
        nodoDestinoId: c.nodoDestinoId,
        razon: c.razon,
        payloadHashRecibido: c.payloadHashRecibido,
        payloadHashExistente: c.payloadHashExistente,
        resolucion: c.resolucion,
      })),
    };
  }

  @Post('certification/conflicts/resolve')
  @UseGuards(SyncCertGuard)
  certConflictsResolve(@Body() body: unknown) {
    const data = objetoBody(body);
    return this.conflictos.resolverCertificacion(
      uuidBody(data.conflictoId, 'conflictoId'),
      'Conflicto revisado durante certificacion 48D-2H',
    );
  }

  @Post('certification/inventory/setup')
  @UseGuards(SyncCertGuard)
  certInventorySetup(@Body() body: unknown) {
    return this.businessCert.prepararInventario(idsInventory(body));
  }

  @Post('certification/inventory/create-edge-flow')
  @UseGuards(SyncCertGuard)
  certInventoryCreate(@Body() body: unknown) {
    return this.businessCert.crearFlujoInventarioEdge(idsInventory(body));
  }

  @Post('certification/inventory/requeue')
  @UseGuards(SyncCertGuard)
  certInventoryRequeue(@Body() body: unknown) {
    const data = objetoBody(body);
    return this.businessCert.reencolarInventario(
      uuidBody(data.articuloGlobalId, 'articuloGlobalId'),
      uuidBody(data.movimientoArticuloGlobalId, 'movimientoArticuloGlobalId'),
      uuidBody(data.movimientoProductoGlobalId, 'movimientoProductoGlobalId'),
    );
  }

  @Post('certification/inventory/update-cloud')
  @UseGuards(SyncCertGuard)
  certInventoryUpdateCloud(@Body() body: unknown) {
    const data = objetoBody(body);
    return this.businessCert.actualizarInventarioCloud(
      uuidBody(data.articuloGlobalId, 'articuloGlobalId'),
      uuidBody(data.usuarioGlobalId, 'usuarioGlobalId'),
    );
  }

  @Get('certification/inventory/status')
  @UseGuards(SyncCertGuard)
  certInventoryStatus(
    @Query('articuloGlobalId') articuloGlobalId?: string,
    @Query('productoGlobalId') productoGlobalId?: string,
  ) {
    return this.businessCert.estadoInventario(
      uuidBody(articuloGlobalId, 'articuloGlobalId'),
      uuidBody(productoGlobalId, 'productoGlobalId'),
    );
  }

}

function lote(body: unknown, maximo: number): unknown[] {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException('Body sync invalido');
  }
  const events = (body as { events?: unknown }).events;
  if (!Array.isArray(events) || events.length < 1 || events.length > maximo) {
    throw new BadRequestException(
      `events debe contener entre 1 y ${maximo} elementos`,
    );
  }
  return events;
}

function limiteSolicitado(body: unknown, maximo: number): number {
  const valor =
    body && typeof body === 'object'
      ? Number((body as { limit?: unknown }).limit ?? maximo)
      : maximo;
  if (!Number.isInteger(valor) || valor < 1)
    throw new BadRequestException('limit invalido');
  return Math.min(valor, maximo);
}

function idsSolicitados(body: unknown, maximo: number): string[] {
  const ids =
    body && typeof body === 'object'
      ? (body as { eventIds?: unknown }).eventIds
      : undefined;
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > maximo) {
    throw new BadRequestException('eventIds invalido');
  }
  const uuid = /^[0-9a-f-]{36}$/i;
  if (ids.some((id) => typeof id !== 'string' || !uuid.test(id))) {
    throw new BadRequestException('eventIds contiene UUID invalido');
  }
  return ids as string[];
}

function destinoCert(body: unknown): string {
  const destino =
    body && typeof body === 'object'
      ? (body as { destinationNodeId?: unknown }).destinationNodeId
      : undefined;
  if (
    typeof destino !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{2,119}$/.test(destino)
  ) {
    throw new BadRequestException('destinationNodeId invalido');
  }
  return destino;
}






function idsConfig(body: unknown) {
  const data = objetoBody(body);
  return {
    restauranteGlobalId: uuidBody(data.restauranteGlobalId, 'restauranteGlobalId'),
    sucursalGlobalId: uuidBody(data.sucursalGlobalId, 'sucursalGlobalId'),
  };
}

function idsSecurity(body: unknown) {
  const data = objetoBody(body);
  return {
    restauranteGlobalId: uuidBody(data.restauranteGlobalId, 'restauranteGlobalId'),
    sucursalGlobalId: uuidBody(data.sucursalGlobalId, 'sucursalGlobalId'),
    usuarioGlobalId: uuidBody(data.usuarioGlobalId, 'usuarioGlobalId'),
  };
}


function idsMasters(body: unknown) {
  const data = objetoBody(body);
  return {
    restauranteGlobalId: uuidBody(data.restauranteGlobalId, 'restauranteGlobalId'),
    sucursalGlobalId: uuidBody(data.sucursalGlobalId, 'sucursalGlobalId'),
    categoriaGlobalId: uuidBody(data.categoriaGlobalId, 'categoriaGlobalId'),
    productoGlobalId: uuidBody(data.productoGlobalId, 'productoGlobalId'),
    zonaGlobalId: uuidBody(data.zonaGlobalId, 'zonaGlobalId'),
    mesaGlobalId: uuidBody(data.mesaGlobalId, 'mesaGlobalId'),
  };
}

function idsLoyalty(body: unknown) {
  const base = idsBusiness(body);
  const data = objetoBody(body);
  return {
    ...base,
    usuarioGlobalId: uuidBody(data.usuarioGlobalId, 'usuarioGlobalId'),
    clienteGlobalId: uuidBody(data.clienteGlobalId, 'clienteGlobalId'),
    nivelGlobalId: uuidBody(data.nivelGlobalId, 'nivelGlobalId'),
    cuentaGlobalId: uuidBody(data.cuentaGlobalId, 'cuentaGlobalId'),
    movimientoGlobalId: uuidBody(data.movimientoGlobalId, 'movimientoGlobalId'),
    consentimientoGlobalId: uuidBody(data.consentimientoGlobalId, 'consentimientoGlobalId'),
  };
}

function idsInventory(body: unknown) {
  const base = idsBusiness(body);
  const data = objetoBody(body);
  return {
    ...base,
    usuarioGlobalId: uuidBody(data.usuarioGlobalId, 'usuarioGlobalId'),
    articuloGlobalId: uuidBody(data.articuloGlobalId, 'articuloGlobalId'),
  };
}

function idsMoney(body: unknown) {
  const base = idsBusiness(body);
  const data = objetoBody(body);
  return {
    ...base,
    usuarioGlobalId: uuidBody(data.usuarioGlobalId, 'usuarioGlobalId'),
    metodoEfectivoGlobalId: uuidBody(data.metodoEfectivoGlobalId, 'metodoEfectivoGlobalId'),
    metodoTarjetaGlobalId: uuidBody(data.metodoTarjetaGlobalId, 'metodoTarjetaGlobalId'),
  };
}

function idsBusiness(body: unknown) {
  const data = objetoBody(body);
  return {
    restauranteGlobalId: uuidBody(data.restauranteGlobalId, 'restauranteGlobalId'),
    sucursalGlobalId: uuidBody(data.sucursalGlobalId, 'sucursalGlobalId'),
    categoriaGlobalId: uuidBody(data.categoriaGlobalId, 'categoriaGlobalId'),
    productoGlobalId: uuidBody(data.productoGlobalId, 'productoGlobalId'),
    estacionGlobalId: uuidBody(data.estacionGlobalId, 'estacionGlobalId'),
  };
}

function objetoBody(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException('Body de certificacion invalido');
  }
  return body as Record<string, unknown>;
}

function uuidBody(valor: unknown, nombre: string): string {
  if (
    typeof valor !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(valor)
  ) {
    throw new BadRequestException(`${nombre} debe ser UUID`);
  }
  return valor;
}
