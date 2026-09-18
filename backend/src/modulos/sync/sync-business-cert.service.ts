import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { Injectable } from '@nestjs/common';
import { AmbitoRol, CanalComunicacion, EstadoCaja, EstadoComanda, EstadoDetalleComanda, EstadoDomicilio, EstadoPedido, EstadoVenta, EstrategiaInventario, FormaMesa, OrientacionMesa, OrigenVenta, Prisma, TipoMetodoPago, TipoMovimientoCaja, TipoMovimientoInventario, TipoMovimientoPuntos, TipoPedido, UnidadInventario } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { obtenerEntorno } from '../../config/entorno';
import { SyncBusinessService } from './sync-business.service';

export type CertBusinessIds = {
  restauranteGlobalId: string;
  sucursalGlobalId: string;
  categoriaGlobalId: string;
  productoGlobalId: string;
  estacionGlobalId: string;
  usuarioGlobalId?: string;
  metodoEfectivoGlobalId?: string;
  metodoTarjetaGlobalId?: string;
};

export type CertInventoryIds = CertBusinessIds & {
  usuarioGlobalId: string;
  articuloGlobalId: string;
};

export type CertMastersIds = {
  restauranteGlobalId: string;
  sucursalGlobalId: string;
  categoriaGlobalId: string;
  productoGlobalId: string;
  zonaGlobalId: string;
  mesaGlobalId: string;
};

export type CertLoyaltyIds = CertBusinessIds & {
  usuarioGlobalId: string;
  clienteGlobalId: string;
  nivelGlobalId: string;
  cuentaGlobalId: string;
  movimientoGlobalId: string;
  consentimientoGlobalId: string;
};

export type CertSecurityIds = {
  restauranteGlobalId: string;
  sucursalGlobalId: string;
  usuarioGlobalId: string;
};

export type CertConfigIds = {
  restauranteGlobalId: string;
  sucursalGlobalId: string;
};

@Injectable()
export class SyncBusinessCertService {
  private readonly entorno = obtenerEntorno();

  constructor(
    private readonly prisma: PrismaService,
    private readonly business: SyncBusinessService,
  ) {}

  async prepararReferencias(ids: CertBusinessIds) {
    const suffix = ids.restauranteGlobalId.replace(/-/g, '').slice(0, 10);
    return this.prisma.transaccionSerializable(async (tx) => {
      const restaurante = await tx.restaurante.upsert({
        where: { globalId: ids.restauranteGlobalId },
        update: { estado: true },
        create: {
          globalId: ids.restauranteGlobalId,
          nombre: `SYNC CERT ${suffix}`,
          nit: `SYNC${suffix}`.slice(0, 20),
          estado: true,
        },
      });
      const sucursal = await tx.sucursal.upsert({
        where: { globalId: ids.sucursalGlobalId },
        update: { estado: true, restauranteId: restaurante.id },
        create: {
          globalId: ids.sucursalGlobalId,
          nombre: `Sucursal Sync ${suffix}`,
          estado: true,
          restauranteId: restaurante.id,
        },
      });
      // En certificacion Cloud, el peer EDGE queda ligado explicitamente a la
      // sucursal actual. No dependemos de un peer global/null acumulado de pruebas
      // anteriores, y reproducimos el alcance que tendra cada EDGE en produccion.
      if (
        this.entorno.syncRol === 'CLOUD' &&
        this.entorno.syncCertificationEnabled &&
        this.entorno.syncBootstrapPeerNodeId
      ) {
        await tx.syncPeer.updateMany({
          where: { nodeId: this.entorno.syncBootstrapPeerNodeId },
          data: {
            restauranteGlobalId: restaurante.globalId,
            sucursalGlobalId: sucursal.globalId,
            activo: true,
          },
        });
        // Limpieza EXCLUSIVA de certificacion: los intentos anteriores de 48D-2B
        // pueden dejar snapshots financieros PENDIENTES para edge-dev. Esos
        // eventos pertenecen a restaurantes/cajas de ejecuciones antiguas y no
        // deben contaminar la corrida actual. En produccion esta rama no existe.
        await tx.syncOutbox.deleteMany({
          where: {
            nodoDestinoId: this.entorno.syncBootstrapPeerNodeId,
            estado: { not: 'SINCRONIZADO' },
            tipoEvento: {
              in: [
                'CAJA.SNAPSHOT_V1',
                'MOVIMIENTO_CAJA.SNAPSHOT_V1',
                'ARTICULO.SNAPSHOT_V1',
                'MOVIMIENTO_INVENTARIO.SNAPSHOT_V1',
                'CLIENTE.SNAPSHOT_V1',
                'NIVEL_FIDELIZACION.SNAPSHOT_V1',
                'CUENTA_FIDELIZACION.SNAPSHOT_V1',
                'MOVIMIENTO_PUNTOS.SNAPSHOT_V1',
                'CONSENTIMIENTO_CLIENTE.SNAPSHOT_V1',
              ],
            },
          },
        });
      }

      const categoria = await tx.categoria.upsert({
        where: { globalId: ids.categoriaGlobalId },
        update: { estado: true, sucursalId: sucursal.id },
        create: {
          globalId: ids.categoriaGlobalId,
          nombre: `Cert ${suffix}`.slice(0, 50),
          estado: true,
          sucursalId: sucursal.id,
        },
      });
      const estacion = await tx.estacionPreparacion.upsert({
        where: { globalId: ids.estacionGlobalId },
        update: { estado: true, sucursalId: sucursal.id },
        create: {
          globalId: ids.estacionGlobalId,
          codigo: `CERT${suffix}`.slice(0, 40),
          nombre: `Cocina Cert ${suffix}`.slice(0, 80),
          sucursalId: sucursal.id,
          estado: true,
        },
      });
      const producto = await tx.producto.upsert({
        where: { globalId: ids.productoGlobalId },
        update: {
          estado: true,
          disponible: true,
          categoriaId: categoria.id,
          estacionId: estacion.id,
        },
        create: {
          globalId: ids.productoGlobalId,
          codigo: `SYNC-${suffix}`,
          nombre: `Producto Sync ${suffix}`,
          precio: new Prisma.Decimal('12500.00'),
          categoriaId: categoria.id,
          estacionId: estacion.id,
          estado: true,
          disponible: true,
        },
      });
      let usuarioId: number | null = null;
      let metodoEfectivoId: number | null = null;
      let metodoTarjetaId: number | null = null;
      if (ids.usuarioGlobalId && ids.metodoEfectivoGlobalId && ids.metodoTarjetaGlobalId) {
        const rol = await tx.rol.upsert({
          where: { clave: `SYNC_CERT_${suffix}` },
          update: { restauranteId: restaurante.id },
          create: { clave: `SYNC_CERT_${suffix}`, nombre: `Sync Cert ${suffix}`.slice(0, 50), ambito: AmbitoRol.RESTAURANTE, restauranteId: restaurante.id },
        });
        const usuario = await tx.usuario.upsert({
          where: { globalId: ids.usuarioGlobalId },
          update: { restauranteId: restaurante.id, sucursalId: sucursal.id, rolId: rol.id, activo: true },
          create: { globalId: ids.usuarioGlobalId, nombres: 'Usuario', apellidos: 'Sync Cert', email: `sync-${ids.usuarioGlobalId}@cert.local`, password: 'NO_LOGIN_SYNC_CERT', activo: true, rolId: rol.id, restauranteId: restaurante.id, sucursalId: sucursal.id },
        });
        const efectivo = await tx.metodoPago.upsert({
          where: { globalId: ids.metodoEfectivoGlobalId },
          update: { activo: false, tipo: TipoMetodoPago.EFECTIVO },
          create: { globalId: ids.metodoEfectivoGlobalId, nombre: `Efectivo Sync ${suffix}`.slice(0,50), tipo: TipoMetodoPago.EFECTIVO, activo: false },
        });
        const tarjeta = await tx.metodoPago.upsert({
          where: { globalId: ids.metodoTarjetaGlobalId },
          update: { activo: false, tipo: TipoMetodoPago.TARJETA },
          create: { globalId: ids.metodoTarjetaGlobalId, nombre: `Tarjeta Sync ${suffix}`.slice(0,50), tipo: TipoMetodoPago.TARJETA, activo: false },
        });
        usuarioId = usuario.id; metodoEfectivoId = efectivo.id; metodoTarjetaId = tarjeta.id;
      }

      return {
        restauranteId: restaurante.id,
        sucursalId: sucursal.id,
        categoriaId: categoria.id,
        estacionId: estacion.id,
        productoId: producto.id,
        usuarioId, metodoEfectivoId, metodoTarjetaId,
      };
    });
  }

  async crearFlujoEdge(ids: CertBusinessIds) {
    return this.prisma.transaccionSerializable(async (tx) => {
      const sucursal = await tx.sucursal.findUniqueOrThrow({
        where: { globalId: ids.sucursalGlobalId },
      });
      const producto = await tx.producto.findUniqueOrThrow({
        where: { globalId: ids.productoGlobalId },
      });
      const estacion = await tx.estacionPreparacion.findUniqueOrThrow({
        where: { globalId: ids.estacionGlobalId },
      });
      const detalleGlobalId = randomUUID();
      const pedido = await tx.pedido.create({
        data: {
          total: new Prisma.Decimal('12500.00'),
          tipo: TipoPedido.DOMICILIO,
          estado: EstadoPedido.PENDIENTE,
          observaciones: 'Certificacion 48D-2A',
          sucursalId: sucursal.id,
          detalles: {
            create: {
              globalId: detalleGlobalId,
              productoId: producto.id,
              cantidad: 1,
              precioUnitario: new Prisma.Decimal('12500.00'),
              subtotal: new Prisma.Decimal('12500.00'),
              observaciones: 'Sin cebolla',
            },
          },
          domicilio: {
            create: {
              destinatario: 'Cliente Sync',
              telefono: '3000000000',
              direccion: 'Direccion certificacion',
              costo: new Prisma.Decimal('0'),
            },
          },
        },
        include: { detalles: true, domicilio: true },
      });
      const comanda = await tx.comanda.create({
        data: {
          pedidoId: pedido.id,
          estacionId: estacion.id,
          estado: EstadoComanda.PENDIENTE,
          detalles: {
            create: {
              detallePedidoId: pedido.detalles[0].id,
              cantidad: 1,
              estado: EstadoDetalleComanda.PENDIENTE,
            },
          },
        },
        include: { detalles: true },
      });

      await this.business.encolarPedido(tx, pedido.id);
      if (pedido.domicilio) await this.business.encolarDomicilio(tx, pedido.domicilio.id);
      await this.business.encolarComanda(tx, comanda.id);

      return {
        pedidoGlobalId: pedido.globalId,
        detallePedidoGlobalId: pedido.detalles[0].globalId,
        domicilioGlobalId: pedido.domicilio!.globalId,
        comandaGlobalId: comanda.globalId,
        detalleComandaGlobalId: comanda.detalles[0].globalId,
      };
    });
  }

  async actualizarDesdeCloud(comandaGlobalId: string, domicilioGlobalId: string) {
    return this.prisma.transaccionSerializable(async (tx) => {
      const comanda = await tx.comanda.findUniqueOrThrow({
        where: { globalId: comandaGlobalId },
        include: { detalles: true },
      });
      const ahora = new Date();
      await tx.comanda.update({
        where: { id: comanda.id },
        data: { estado: EstadoComanda.EN_PREPARACION, fechaInicio: ahora },
      });
      await tx.detalleComanda.updateMany({
        where: { comandaId: comanda.id },
        data: { estado: EstadoDetalleComanda.EN_PREPARACION, fechaInicio: ahora },
      });
      await tx.pedido.update({
        where: { id: comanda.pedidoId },
        data: { estado: EstadoPedido.EN_PREPARACION },
      });
      const domicilio = await tx.domicilio.update({
        where: { globalId: domicilioGlobalId },
        data: {
          estado: EstadoDomicilio.CANCELADO,
          observacion: 'Actualizado desde Cloud 48D-2A',
        },
      });
      await this.business.encolarComanda(tx, comanda.id);
      await this.business.encolarPedido(tx, comanda.pedidoId);
      await this.business.encolarDomicilio(tx, domicilio.id);
      return { comandaGlobalId, domicilioGlobalId };
    });
  }


  async crearFlujoDineroEdge(ids: CertBusinessIds & { usuarioGlobalId: string; metodoEfectivoGlobalId: string; metodoTarjetaGlobalId: string }) {
    return this.prisma.transaccionSerializable(async (tx) => {
      const sucursal = await tx.sucursal.findUniqueOrThrow({ where: { globalId: ids.sucursalGlobalId } });
      const producto = await tx.producto.findUniqueOrThrow({ where: { globalId: ids.productoGlobalId } });
      const usuario = await tx.usuario.findUniqueOrThrow({ where: { globalId: ids.usuarioGlobalId } });
      const efectivo = await tx.metodoPago.findUniqueOrThrow({ where: { globalId: ids.metodoEfectivoGlobalId } });
      const tarjeta = await tx.metodoPago.findUniqueOrThrow({ where: { globalId: ids.metodoTarjetaGlobalId } });
      const caja = await tx.caja.create({ data: { nombre: 'Caja Sync 48D-2B', estado: EstadoCaja.ABIERTA, saldoInicial: new Prisma.Decimal('50000'), sucursalId: sucursal.id, abiertaPorId: usuario.id, aperturaClave: `sync-open-${randomUUID()}`, aperturaHash: 'cert' } });
      const venta = await tx.venta.create({
        data: { origen: OrigenVenta.DIRECTA, estado: EstadoVenta.PAGADA, subtotal: new Prisma.Decimal('100000'), descuentos: new Prisma.Decimal(0), impuestos: new Prisma.Decimal(0), impoconsumo: new Prisma.Decimal(0), propina: new Prisma.Decimal(0), domicilioCosto: new Prisma.Decimal(0), total: new Prisma.Decimal('100000'), fechaOperacion: new Date(), sucursalId: sucursal.id, usuarioId: usuario.id, idempotenciaClave: `sync-sale-${randomUUID()}`, idempotenciaHash: 'cert' },
      });
      const detalle = await tx.detalleVenta.create({ data: { ventaId: venta.id, productoId: producto.id, cantidad: 1, precioUnitario: new Prisma.Decimal('100000'), subtotal: new Prisma.Decimal('100000') } });
      const pago1 = await tx.pago.create({ data: { ventaId: venta.id, metodoPagoId: efectivo.id, monto: new Prisma.Decimal('40000'), referencia: 'PARCIAL-EFECTIVO', cajaId: caja.id, usuarioId: usuario.id, idempotenciaClave: `sync-pay-1-${randomUUID()}`, idempotenciaHash: 'cert' } });
      const pago2 = await tx.pago.create({ data: { ventaId: venta.id, metodoPagoId: tarjeta.id, monto: new Prisma.Decimal('60000'), referencia: 'MIXTO-TARJETA', cajaId: caja.id, usuarioId: usuario.id, idempotenciaClave: `sync-pay-2-${randomUUID()}`, idempotenciaHash: 'cert' } });
      await this.business.encolarCaja(tx, caja.id);
      await this.business.encolarVenta(tx, venta.id);
      await this.business.encolarPago(tx, pago1.id);
      await this.business.encolarPago(tx, pago2.id);
      return { cajaGlobalId: caja.globalId, ventaGlobalId: venta.globalId, detalleVentaGlobalId: detalle.globalId, pagoGlobalIds: [pago1.globalId, pago2.globalId] };
    });
  }


  async reencolarDinero(ventaGlobalId: string, cajaGlobalId: string) {
    return this.prisma.transaccionSerializable(async (tx) => {
      const venta = await tx.venta.findUniqueOrThrow({ where: { globalId: ventaGlobalId }, include: { pagos: true } });
      const caja = await tx.caja.findUniqueOrThrow({ where: { globalId: cajaGlobalId } });
      await this.business.encolarCaja(tx, caja.id);
      await this.business.encolarVenta(tx, venta.id);
      for (const pago of venta.pagos) await this.business.encolarPago(tx, pago.id);
      return { ventaGlobalId, cajaGlobalId, pagos: venta.pagos.map((p) => p.globalId) };
    });
  }

  async movimientoDesdeCloud(cajaGlobalId: string, usuarioGlobalId: string) {
    return this.prisma.transaccionSerializable(async (tx) => {
      const caja = await tx.caja.findUniqueOrThrow({ where: { globalId: cajaGlobalId } });
      const usuario = await tx.usuario.findUniqueOrThrow({ where: { globalId: usuarioGlobalId } });
      const mov = await tx.movimientoCaja.create({ data: { cajaId: caja.id, usuarioId: usuario.id, tipo: TipoMovimientoCaja.INGRESO, monto: new Prisma.Decimal('7000'), concepto: 'Ajuste certificado Cloud 48D-2B', observacion: 'CLOUD -> EDGE', idempotenciaClave: `sync-mov-${randomUUID()}`, idempotenciaHash: 'cert' } });
      const eventosMovimiento = await this.business.encolarMovimientoCaja(tx, mov.id);
      const eventosCaja = await this.business.encolarCaja(tx, caja.id);
      const outboxMovimiento = await tx.syncOutbox.findMany({
        where: {
          agregadoGlobalId: mov.globalId,
          tipoEvento: 'MOVIMIENTO_CAJA.SNAPSHOT_V1',
        },
        orderBy: { id: 'desc' },
        take: 10,
        select: {
          eventId: true,
          nodoOrigenId: true,
          nodoDestinoId: true,
          estado: true,
        },
      });
      return {
        movimientoCajaGlobalId: mov.globalId,
        cajaGlobalId,
        eventosMovimiento,
        eventosCaja,
        outboxMovimiento,
      };
    });
  }

  async estadoDinero(ventaGlobalId: string, cajaGlobalId: string) {
    const [venta, caja] = await Promise.all([
      this.prisma.venta.findUnique({ where: { globalId: ventaGlobalId }, include: { detalles: true, pagos: { include: { metodoPago: true } } } }),
      this.prisma.caja.findUnique({ where: { globalId: cajaGlobalId }, include: { movimientos: true } }),
    ]);
    return {
      venta: venta ? { globalId: venta.globalId, estado: venta.estado, total: venta.total.toString(), detalles: venta.detalles.length, pagos: venta.pagos.map(p => ({ globalId: p.globalId, monto: p.monto.toString(), tipo: p.metodoPago.tipo, referencia: p.referencia })), totalPagado: venta.pagos.reduce((a,p)=>a.plus(p.monto), new Prisma.Decimal(0)).toString() } : null,
      caja: caja ? { globalId: caja.globalId, estado: caja.estado, saldoInicial: caja.saldoInicial.toString(), movimientos: caja.movimientos.map(m => ({ globalId: m.globalId, tipo: m.tipo, monto: m.monto.toString(), concepto: m.concepto })) } : null,
    };
  }


  async prepararInventario(ids: CertInventoryIds) {
    const refs = await this.prepararReferencias(ids);
    const suffix = ids.restauranteGlobalId.replace(/-/g, '').slice(0, 10);
    return this.prisma.transaccionSerializable(async (tx) => {
      const restaurante = await tx.restaurante.findUniqueOrThrow({
        where: { globalId: ids.restauranteGlobalId },
      });
      const sucursal = await tx.sucursal.findUniqueOrThrow({
        where: { globalId: ids.sucursalGlobalId },
      });
      const rol = await tx.rol.upsert({
        where: { clave: `SYNC_INV_${suffix}` },
        update: { restauranteId: restaurante.id },
        create: {
          clave: `SYNC_INV_${suffix}`,
          nombre: `Sync Inventario ${suffix}`.slice(0, 50),
          ambito: AmbitoRol.RESTAURANTE,
          restauranteId: restaurante.id,
        },
      });
      await tx.usuario.upsert({
        where: { globalId: ids.usuarioGlobalId },
        update: {
          restauranteId: restaurante.id,
          sucursalId: sucursal.id,
          rolId: rol.id,
          activo: true,
        },
        create: {
          globalId: ids.usuarioGlobalId,
          nombres: 'Usuario',
          apellidos: 'Inventario Sync',
          email: `sync-inv-${ids.usuarioGlobalId}@cert.local`,
          password: 'NO_LOGIN_SYNC_CERT',
          activo: true,
          rolId: rol.id,
          restauranteId: restaurante.id,
          sucursalId: sucursal.id,
        },
      });

      const producto = await tx.producto.findUniqueOrThrow({
        where: { globalId: ids.productoGlobalId },
      });
      await tx.producto.update({
        where: { id: producto.id },
        data: {
          estrategiaInventario: EstrategiaInventario.STOCK_DIRECTO,
          unidadInventario: UnidadInventario.UNIDAD,
          stock: new Prisma.Decimal('20'),
        },
      });

      // El articulo se crea solo en EDGE; CLOUD debe recibirlo por sync real.
      // Si una ejecucion anterior dejo el articulo, lo limpiamos solo dentro
      // del alcance UUID efimero de esta certificacion.
      if (this.entorno.syncRol === 'CLOUD') {
        const previo = await tx.articulo.findUnique({
          where: { globalId: ids.articuloGlobalId },
        });
        if (previo) {
          await tx.movimientoInventario.deleteMany({
            where: { articuloId: previo.id },
          });
          await tx.articulo.delete({ where: { id: previo.id } });
        }
      }
      return { ...refs, productoGlobalId: ids.productoGlobalId };
    });
  }

  async crearFlujoInventarioEdge(ids: CertInventoryIds) {
    return this.prisma.transaccionSerializable(async (tx) => {
      const sucursal = await tx.sucursal.findUniqueOrThrow({
        where: { globalId: ids.sucursalGlobalId },
      });
      const usuario = await tx.usuario.findUniqueOrThrow({
        where: { globalId: ids.usuarioGlobalId },
      });
      const producto = await tx.producto.findUniqueOrThrow({
        where: { globalId: ids.productoGlobalId },
      });

      const articulo = await tx.articulo.create({
        data: {
          globalId: ids.articuloGlobalId,
          nombre: 'Cafe grano Sync 48D-2C',
          unidad: UnidadInventario.GR,
          costoUnidad: new Prisma.Decimal('30.00'),
          stock: new Prisma.Decimal(0),
          stockMinimo: new Prisma.Decimal('100'),
          diasAnticipacion: 3,
          estado: true,
          sucursalId: sucursal.id,
        },
      });
      await this.business.encolarArticulo(tx, articulo.id);

      const articuloActualizado = await tx.articulo.update({
        where: { id: articulo.id },
        data: { stock: new Prisma.Decimal('500') },
      });
      const movArticulo = await tx.movimientoInventario.create({
        data: {
          tipo: TipoMovimientoInventario.ENTRADA,
          cantidad: new Prisma.Decimal('500'),
          unidad: UnidadInventario.GR,
          stockAnterior: new Prisma.Decimal(0),
          stockNuevo: articuloActualizado.stock,
          motivo: 'Entrada offline EDGE 48D-2C',
          sucursalId: sucursal.id,
          usuarioId: usuario.id,
          articuloId: articulo.id,
        },
      });
      await this.business.encolarMovimientoInventario(tx, movArticulo.id);

      const stockProductoAnterior = producto.stock;
      const productoActualizado = await tx.producto.update({
        where: { id: producto.id },
        data: { stock: { decrement: new Prisma.Decimal('2') } },
      });
      const movProducto = await tx.movimientoInventario.create({
        data: {
          tipo: TipoMovimientoInventario.CONSUMO_INTERNO,
          cantidad: new Prisma.Decimal('2'),
          unidad: UnidadInventario.UNIDAD,
          stockAnterior: stockProductoAnterior,
          stockNuevo: productoActualizado.stock,
          motivo: 'Consumo offline EDGE 48D-2C',
          sucursalId: sucursal.id,
          usuarioId: usuario.id,
          productoId: producto.id,
        },
      });
      await this.business.encolarMovimientoInventario(tx, movProducto.id);

      return {
        articuloGlobalId: articulo.globalId,
        movimientoArticuloGlobalId: movArticulo.globalId,
        movimientoProductoGlobalId: movProducto.globalId,
      };
    });
  }

  async reencolarInventario(
    articuloGlobalId: string,
    movimientoArticuloGlobalId: string,
    movimientoProductoGlobalId: string,
  ) {
    return this.prisma.transaccionSerializable(async (tx) => {
      const articulo = await tx.articulo.findUniqueOrThrow({
        where: { globalId: articuloGlobalId },
      });
      const movArticulo = await tx.movimientoInventario.findUniqueOrThrow({
        where: { globalId: movimientoArticuloGlobalId },
      });
      const movProducto = await tx.movimientoInventario.findUniqueOrThrow({
        where: { globalId: movimientoProductoGlobalId },
      });
      await this.business.encolarArticulo(tx, articulo.id);
      await this.business.encolarMovimientoInventario(tx, movArticulo.id);
      await this.business.encolarMovimientoInventario(tx, movProducto.id);
      return { articuloGlobalId, movimientoArticuloGlobalId, movimientoProductoGlobalId };
    });
  }

  async actualizarInventarioCloud(
    articuloGlobalId: string,
    usuarioGlobalId: string,
  ) {
    return this.prisma.transaccionSerializable(async (tx) => {
      const articulo = await tx.articulo.findUniqueOrThrow({
        where: { globalId: articuloGlobalId },
        include: { sucursal: true },
      });
      const usuario = await tx.usuario.findUniqueOrThrow({
        where: { globalId: usuarioGlobalId },
      });
      const actualizado = await tx.articulo.update({
        where: { id: articulo.id },
        data: {
          nombre: 'Cafe grano Sync 48D-2C CLOUD',
          costoUnidad: new Prisma.Decimal('32.50'),
          stock: { decrement: new Prisma.Decimal('75') },
        },
      });
      await this.business.encolarArticulo(tx, articulo.id);
      const movimiento = await tx.movimientoInventario.create({
        data: {
          tipo: TipoMovimientoInventario.MERMA,
          cantidad: new Prisma.Decimal('75'),
          unidad: articulo.unidad,
          stockAnterior: articulo.stock,
          stockNuevo: actualizado.stock,
          motivo: 'Merma CLOUD -> EDGE 48D-2C',
          sucursalId: articulo.sucursalId,
          usuarioId: usuario.id,
          articuloId: articulo.id,
        },
      });
      const eventosMovimiento = await this.business.encolarMovimientoInventario(
        tx,
        movimiento.id,
      );
      return {
        articuloGlobalId,
        movimientoGlobalId: movimiento.globalId,
        eventosMovimiento,
      };
    });
  }

  async estadoInventario(
    articuloGlobalId: string,
    productoGlobalId: string,
  ) {
    const [articulo, producto] = await Promise.all([
      this.prisma.articulo.findUnique({
        where: { globalId: articuloGlobalId },
        include: { movimientosInventario: { orderBy: { id: 'asc' } } },
      }),
      this.prisma.producto.findUnique({
        where: { globalId: productoGlobalId },
        include: { movimientosInventario: { orderBy: { id: 'asc' } } },
      }),
    ]);
    return {
      articulo: articulo
        ? {
            globalId: articulo.globalId,
            nombre: articulo.nombre,
            costoUnidad: articulo.costoUnidad.toString(),
            stock: articulo.stock.toString(),
            movimientos: articulo.movimientosInventario.map((m) => ({
              globalId: m.globalId,
              tipo: m.tipo,
              stockAnterior: m.stockAnterior.toString(),
              stockNuevo: m.stockNuevo.toString(),
            })),
          }
        : null,
      producto: producto
        ? {
            globalId: producto.globalId,
            stock: producto.stock.toString(),
            movimientos: producto.movimientosInventario.map((m) => ({
              globalId: m.globalId,
              tipo: m.tipo,
              stockAnterior: m.stockAnterior.toString(),
              stockNuevo: m.stockNuevo.toString(),
            })),
          }
        : null,
    };
  }


  async prepararFidelizacion(ids: CertLoyaltyIds) {
    const refs = await this.prepararReferencias(ids);
    const suffix = ids.restauranteGlobalId.replace(/-/g, '').slice(0, 10);
    return this.prisma.transaccionSerializable(async (tx) => {
      const restaurante = await tx.restaurante.findUniqueOrThrow({
        where: { globalId: ids.restauranteGlobalId },
      });
      const sucursal = await tx.sucursal.findUniqueOrThrow({
        where: { globalId: ids.sucursalGlobalId },
      });

      // 48D-2D necesita el mismo usuario de referencia tanto en EDGE como en
      // CLOUD. prepararReferencias solo crea usuario cuando tambien recibe los
      // metodos de pago de 48D-2B, por lo que fidelizacion quedaba sin usuario y
      // create-edge-flow fallaba al hacer findUniqueOrThrow(usuarioGlobalId).
      const rol = await tx.rol.upsert({
        where: { clave: `SYNC_FID_${suffix}` },
        update: { restauranteId: restaurante.id },
        create: {
          clave: `SYNC_FID_${suffix}`,
          nombre: `Sync Fidelizacion ${suffix}`.slice(0, 50),
          ambito: AmbitoRol.RESTAURANTE,
          restauranteId: restaurante.id,
        },
      });
      await tx.usuario.upsert({
        where: { globalId: ids.usuarioGlobalId },
        update: {
          restauranteId: restaurante.id,
          sucursalId: sucursal.id,
          rolId: rol.id,
          activo: true,
        },
        create: {
          globalId: ids.usuarioGlobalId,
          nombres: 'Usuario',
          apellidos: 'Fidelizacion Sync',
          email: `sync-fid-${ids.usuarioGlobalId}@cert.local`,
          password: 'NO_LOGIN_SYNC_CERT',
          activo: true,
          rolId: rol.id,
          restauranteId: restaurante.id,
          sucursalId: sucursal.id,
        },
      });

      if (this.entorno.syncRol === 'CLOUD') {
        const cliente = await tx.cliente.findUnique({ where: { globalId: ids.clienteGlobalId } });
        if (cliente) {
          const cuenta = await tx.cuentaFidelizacion.findUnique({ where: { clienteId: cliente.id } });
          if (cuenta) {
            await tx.movimientoPuntos.deleteMany({ where: { cuentaId: cuenta.id } });
            await tx.cuentaFidelizacion.delete({ where: { id: cuenta.id } });
          }
          await tx.consentimientoCliente.deleteMany({ where: { clienteId: cliente.id } });
          await tx.cliente.delete({ where: { id: cliente.id } });
        }
        await tx.nivelFidelizacion.deleteMany({ where: { globalId: ids.nivelGlobalId } });
      }
      return refs;
    });
  }

  async crearFlujoFidelizacionEdge(ids: CertLoyaltyIds) {
    return this.prisma.transaccionSerializable(async (tx) => {
      const restaurante = await tx.restaurante.findUniqueOrThrow({ where: { globalId: ids.restauranteGlobalId } });
      const usuario = await tx.usuario.findUniqueOrThrow({ where: { globalId: ids.usuarioGlobalId } });
      const nivel = await tx.nivelFidelizacion.create({
        data: { globalId: ids.nivelGlobalId, restauranteId: restaurante.id, nombre: `Nivel Sync ${ids.nivelGlobalId.slice(0, 6)}`, puntosMinimos: 100, multiplicador: new Prisma.Decimal('1.25'), beneficios: { certificado: '48D-2D' }, activo: true },
      });
      const cliente = await tx.cliente.create({
        data: { globalId: ids.clienteGlobalId, restauranteId: restaurante.id, tipoDocumento: 'CC', numeroDocumento: `SYNC${ids.clienteGlobalId.replace(/-/g,'').slice(0,12)}`, nombres: 'Cliente Sync', apellidos: '48D-2D', telefono: '3001112233', correo: `sync-${ids.clienteGlobalId.slice(0,8)}@example.test`, estado: true },
      });
      const cuenta = await tx.cuentaFidelizacion.create({
        data: { globalId: ids.cuentaGlobalId, clienteId: cliente.id, nivelId: nivel.id, saldoPuntos: 120, puntosHistoricos: 120 },
      });
      const mov = await tx.movimientoPuntos.create({
        data: { globalId: ids.movimientoGlobalId, cuentaId: cuenta.id, usuarioId: usuario.id, tipo: TipoMovimientoPuntos.AJUSTE, puntos: 120, saldoPosterior: 120, motivo: 'Carga offline EDGE 48D-2D' },
      });
      const cons = await tx.consentimientoCliente.create({
        data: { globalId: ids.consentimientoGlobalId, clienteId: cliente.id, usuarioId: usuario.id, canal: CanalComunicacion.WHATSAPP, otorgado: true, fuente: 'CERT-48D-2D' },
      });
      await this.business.encolarNivelFidelizacion(tx, nivel.id);
      await this.business.encolarCliente(tx, cliente.id);
      await this.business.encolarCuentaFidelizacion(tx, cuenta.id);
      await this.business.encolarMovimientoPuntos(tx, mov.id);
      await this.business.encolarConsentimientoCliente(tx, cons.id);
      return { clienteGlobalId: cliente.globalId, nivelGlobalId: nivel.globalId, cuentaGlobalId: cuenta.globalId, movimientoGlobalId: mov.globalId, consentimientoGlobalId: cons.globalId };
    });
  }

  async reencolarFidelizacion(ids: CertLoyaltyIds) {
    return this.prisma.transaccionSerializable(async (tx) => {
      const cliente = await tx.cliente.findUniqueOrThrow({ where: { globalId: ids.clienteGlobalId } });
      const nivel = await tx.nivelFidelizacion.findUniqueOrThrow({ where: { globalId: ids.nivelGlobalId } });
      const cuenta = await tx.cuentaFidelizacion.findUniqueOrThrow({ where: { globalId: ids.cuentaGlobalId } });
      const mov = await tx.movimientoPuntos.findUniqueOrThrow({ where: { globalId: ids.movimientoGlobalId } });
      const cons = await tx.consentimientoCliente.findUniqueOrThrow({ where: { globalId: ids.consentimientoGlobalId } });
      await this.business.encolarNivelFidelizacion(tx, nivel.id);
      await this.business.encolarCliente(tx, cliente.id);
      await this.business.encolarCuentaFidelizacion(tx, cuenta.id);
      await this.business.encolarMovimientoPuntos(tx, mov.id);
      await this.business.encolarConsentimientoCliente(tx, cons.id);
      return { ok: true };
    });
  }

  async actualizarFidelizacionCloud(ids: CertLoyaltyIds) {
    return this.prisma.transaccionSerializable(async (tx) => {
      const cliente = await tx.cliente.findUniqueOrThrow({ where: { globalId: ids.clienteGlobalId } });
      const cuenta = await tx.cuentaFidelizacion.findUniqueOrThrow({ where: { globalId: ids.cuentaGlobalId } });
      const usuario = await tx.usuario.findUniqueOrThrow({ where: { globalId: ids.usuarioGlobalId } });
      const clienteActualizado = await tx.cliente.update({ where: { id: cliente.id }, data: { telefono: '3019998877', direccion: 'Actualizado CLOUD 48D-2D' } });
      const nuevoSaldo = cuenta.saldoPuntos - 20;
      const cuentaActualizada = await tx.cuentaFidelizacion.update({ where: { id: cuenta.id }, data: { saldoPuntos: nuevoSaldo } });
      const mov = await tx.movimientoPuntos.create({ data: { cuentaId: cuenta.id, usuarioId: usuario.id, tipo: TipoMovimientoPuntos.AJUSTE, puntos: -20, saldoPosterior: nuevoSaldo, motivo: 'Ajuste CLOUD -> EDGE 48D-2D' } });
      const cons = await tx.consentimientoCliente.findFirstOrThrow({ where: { clienteId: cliente.id, canal: CanalComunicacion.WHATSAPP } });
      const consActualizado = await tx.consentimientoCliente.update({ where: { id: cons.id }, data: { otorgado: false, revocadoEn: new Date(), registradoEn: new Date(), fuente: 'CLOUD-48D-2D', usuarioId: usuario.id } });
      await this.business.encolarCliente(tx, clienteActualizado.id);
      await this.business.encolarCuentaFidelizacion(tx, cuentaActualizada.id);
      await this.business.encolarMovimientoPuntos(tx, mov.id);
      await this.business.encolarConsentimientoCliente(tx, consActualizado.id);
      return { movimientoCloudGlobalId: mov.globalId, saldo: nuevoSaldo };
    });
  }

  async estadoFidelizacion(clienteGlobalId: string) {
    const cliente = await this.prisma.cliente.findUnique({
      where: { globalId: clienteGlobalId },
      include: { cuentaFidelizacion: { include: { nivel: true, movimientos: { orderBy: { id: 'asc' } } } }, consentimientos: true },
    });
    if (!cliente) return { cliente: null };
    return {
      cliente: {
        globalId: cliente.globalId,
        telefono: cliente.telefono,
        direccion: cliente.direccion,
        cuenta: cliente.cuentaFidelizacion ? {
          globalId: cliente.cuentaFidelizacion.globalId,
          saldoPuntos: cliente.cuentaFidelizacion.saldoPuntos,
          puntosHistoricos: cliente.cuentaFidelizacion.puntosHistoricos,
          nivelGlobalId: cliente.cuentaFidelizacion.nivel?.globalId ?? null,
          movimientos: cliente.cuentaFidelizacion.movimientos.map((m) => ({ globalId: m.globalId, puntos: m.puntos, saldoPosterior: m.saldoPosterior, motivo: m.motivo })),
        } : null,
        consentimientos: cliente.consentimientos.map((c) => ({ globalId: c.globalId, canal: c.canal, otorgado: c.otorgado, fuente: c.fuente })),
      },
    };
  }


  async prepararMaestros(ids: CertMastersIds) {
    const suffix = ids.restauranteGlobalId.replace(/-/g, '').slice(0, 10);
    return this.prisma.transaccionSerializable(async (tx) => {
      const restaurante = await tx.restaurante.upsert({
        where: { globalId: ids.restauranteGlobalId },
        update: { estado: true },
        create: {
          globalId: ids.restauranteGlobalId,
          nombre: `SYNC MASTER ${suffix}`,
          nit: `MST${suffix}`.slice(0, 20),
          estado: true,
        },
      });
      const sucursal = await tx.sucursal.upsert({
        where: { globalId: ids.sucursalGlobalId },
        update: { estado: true, restauranteId: restaurante.id },
        create: {
          globalId: ids.sucursalGlobalId,
          nombre: `Sucursal Master ${suffix}`,
          estado: true,
          restauranteId: restaurante.id,
        },
      });
      if (
        this.entorno.syncRol === 'CLOUD' &&
        this.entorno.syncCertificationEnabled &&
        this.entorno.syncBootstrapPeerNodeId
      ) {
        await tx.syncPeer.updateMany({
          where: { nodeId: this.entorno.syncBootstrapPeerNodeId },
          data: {
            restauranteGlobalId: restaurante.globalId,
            sucursalGlobalId: sucursal.globalId,
            activo: true,
          },
        });
      }
      return {
        restauranteGlobalId: restaurante.globalId,
        sucursalGlobalId: sucursal.globalId,
      };
    });
  }

  async crearFlujoMaestrosEdge(ids: CertMastersIds) {
    return this.prisma.transaccionSerializable(async (tx) => {
      const sucursal = await tx.sucursal.findUniqueOrThrow({
        where: { globalId: ids.sucursalGlobalId },
      });
      const categoria = await tx.categoria.create({
        data: {
          globalId: ids.categoriaGlobalId,
          nombre: 'Hamburguesas Sync EDGE',
          estado: true,
          sucursalId: sucursal.id,
        },
      });
      const producto = await tx.producto.create({
        data: {
          globalId: ids.productoGlobalId,
          codigo: `SYNC-${ids.productoGlobalId.slice(0, 8).toUpperCase()}`,
          nombre: 'Burger Sync EDGE',
          descripcion: 'Maestro offline 48D-2E',
          precio: new Prisma.Decimal('18500.00'),
          favorito: true,
          disponible: true,
          estrategiaInventario: EstrategiaInventario.NO_CONTROLAR,
          unidadInventario: UnidadInventario.UNIDAD,
          stock: new Prisma.Decimal('0'),
          rendimientoPorcentaje: new Prisma.Decimal('100'),
          estado: true,
          categoriaId: categoria.id,
          modificadores: {
            create: [
              { nombre: 'Extra queso', precio: new Prisma.Decimal('2500'), activo: true, orden: 0 },
              { nombre: 'Jalapeno', precio: new Prisma.Decimal('1200'), activo: true, orden: 1 },
            ],
          },
        },
      });
      const zona = await tx.zona.create({
        data: {
          globalId: ids.zonaGlobalId,
          nombre: 'Salon Sync EDGE',
          estado: true,
          sucursalId: sucursal.id,
        },
      });
      const mesa = await tx.mesa.create({
        data: {
          globalId: ids.mesaGlobalId,
          numero: 'M-SYNC-1',
          capacidad: 4,
          forma: FormaMesa.RECTANGULAR,
          orientacion: OrientacionMesa.HORIZONTAL,
          tamanoVisual: 2,
          estado: true,
          zonaId: zona.id,
        },
      });
      await this.business.encolarCategoria(tx, categoria.id);
      await this.business.encolarProducto(tx, producto.id);
      await this.business.encolarZona(tx, zona.id);
      await this.business.encolarMesa(tx, mesa.id);
      return {
        categoriaGlobalId: categoria.globalId,
        productoGlobalId: producto.globalId,
        zonaGlobalId: zona.globalId,
        mesaGlobalId: mesa.globalId,
      };
    });
  }

  async reencolarMaestros(ids: CertMastersIds) {
    return this.prisma.transaccionSerializable(async (tx) => {
      const categoria = await tx.categoria.findUniqueOrThrow({ where: { globalId: ids.categoriaGlobalId } });
      const producto = await tx.producto.findUniqueOrThrow({ where: { globalId: ids.productoGlobalId } });
      const zona = await tx.zona.findUniqueOrThrow({ where: { globalId: ids.zonaGlobalId } });
      const mesa = await tx.mesa.findUniqueOrThrow({ where: { globalId: ids.mesaGlobalId } });
      await this.business.encolarCategoria(tx, categoria.id);
      await this.business.encolarProducto(tx, producto.id);
      await this.business.encolarZona(tx, zona.id);
      await this.business.encolarMesa(tx, mesa.id);
      return { ok: true };
    });
  }

  async actualizarMaestrosCloud(ids: CertMastersIds) {
    return this.prisma.transaccionSerializable(async (tx) => {
      const categoria = await tx.categoria.findUniqueOrThrow({ where: { globalId: ids.categoriaGlobalId } });
      const producto = await tx.producto.findUniqueOrThrow({ where: { globalId: ids.productoGlobalId } });
      const zona = await tx.zona.findUniqueOrThrow({ where: { globalId: ids.zonaGlobalId } });
      const mesa = await tx.mesa.findUniqueOrThrow({ where: { globalId: ids.mesaGlobalId } });
      const categoriaActualizada = await tx.categoria.update({
        where: { id: categoria.id },
        data: { nombre: 'Hamburguesas Sync CLOUD' },
      });
      const productoActualizado = await tx.producto.update({
        where: { id: producto.id },
        data: { precio: new Prisma.Decimal('19900.00'), disponible: false, favorito: false },
      });
      await tx.productoModificador.updateMany({
        where: { productoId: producto.id, nombre: 'Extra queso' },
        data: { precio: new Prisma.Decimal('3000.00') },
      });
      const zonaActualizada = await tx.zona.update({
        where: { id: zona.id },
        data: { nombre: 'Terraza Sync CLOUD' },
      });
      const mesaActualizada = await tx.mesa.update({
        where: { id: mesa.id },
        data: { numero: 'M-SYNC-9', capacidad: 6, tamanoVisual: 3 },
      });
      const eventos = {
        categoria: await this.business.encolarCategoria(tx, categoriaActualizada.id),
        producto: await this.business.encolarProducto(tx, productoActualizado.id),
        zona: await this.business.encolarZona(tx, zonaActualizada.id),
        mesa: await this.business.encolarMesa(tx, mesaActualizada.id),
      };
      return { eventos };
    });
  }

  async estadoMaestros(ids: CertMastersIds) {
    const [categoria, producto, zona, mesa] = await Promise.all([
      this.prisma.categoria.findUnique({ where: { globalId: ids.categoriaGlobalId } }),
      this.prisma.producto.findUnique({
        where: { globalId: ids.productoGlobalId },
        include: { modificadores: { orderBy: [{ orden: 'asc' }, { id: 'asc' }] } },
      }),
      this.prisma.zona.findUnique({ where: { globalId: ids.zonaGlobalId } }),
      this.prisma.mesa.findUnique({ where: { globalId: ids.mesaGlobalId } }),
    ]);
    return {
      categoria: categoria ? { globalId: categoria.globalId, nombre: categoria.nombre, estado: categoria.estado } : null,
      producto: producto ? {
        globalId: producto.globalId,
        nombre: producto.nombre,
        precio: producto.precio.toString(),
        disponible: producto.disponible,
        favorito: producto.favorito,
        modificadores: producto.modificadores.map((m) => ({ nombre: m.nombre, precio: m.precio.toString(), activo: m.activo, orden: m.orden })),
      } : null,
      zona: zona ? { globalId: zona.globalId, nombre: zona.nombre, estado: zona.estado } : null,
      mesa: mesa ? { globalId: mesa.globalId, numero: mesa.numero, capacidad: mesa.capacidad, tamanoVisual: mesa.tamanoVisual, estado: mesa.estado, situacion: mesa.situacion } : null,
    };
  }


  async prepararSeguridad(ids: CertSecurityIds) {
    const suffix = ids.restauranteGlobalId.replace(/-/g, '').slice(0, 10);
    const rolClave = `SYNC:48D2F:${suffix}`;
    return this.prisma.transaccionSerializable(async (tx) => {
      const restaurante = await tx.restaurante.upsert({
        where: { globalId: ids.restauranteGlobalId },
        update: { estado: true },
        create: {
          globalId: ids.restauranteGlobalId,
          nombre: `SYNC SECURITY ${suffix}`,
          nit: `SEC${suffix}`.slice(0, 20),
          estado: true,
        },
      });
      const sucursal = await tx.sucursal.upsert({
        where: { globalId: ids.sucursalGlobalId },
        update: { estado: true, restauranteId: restaurante.id },
        create: {
          globalId: ids.sucursalGlobalId,
          nombre: `Sucursal Security ${suffix}`,
          estado: true,
          restauranteId: restaurante.id,
        },
      });
      const view = await tx.permiso.upsert({
        where: { codigo: 'SYNC48D2F_VIEW' },
        update: { activo: true },
        create: {
          codigo: 'SYNC48D2F_VIEW',
          nombre: 'Certificacion sync seguridad ver',
          modulo: 'SYNC',
          activo: true,
        },
      });
      await tx.permiso.upsert({
        where: { codigo: 'SYNC48D2F_MANAGE' },
        update: { activo: true },
        create: {
          codigo: 'SYNC48D2F_MANAGE',
          nombre: 'Certificacion sync seguridad gestionar',
          modulo: 'SYNC',
          activo: true,
        },
      });
      const rol = await tx.rol.upsert({
        where: { clave: rolClave },
        update: {
          nombre: 'OPERADOR SYNC 48D2F',
          descripcion: 'Rol de certificacion hibrida',
          ambito: AmbitoRol.RESTAURANTE,
          restauranteId: restaurante.id,
        },
        create: {
          clave: rolClave,
          nombre: 'OPERADOR SYNC 48D2F',
          descripcion: 'Rol de certificacion hibrida',
          ambito: AmbitoRol.RESTAURANTE,
          restauranteId: restaurante.id,
        },
      });
      await tx.rolPermiso.deleteMany({ where: { rolId: rol.id } });
      await tx.rolPermiso.create({ data: { rolId: rol.id, permisoId: view.id } });

      if (
        this.entorno.syncRol === 'CLOUD' &&
        this.entorno.syncCertificationEnabled &&
        this.entorno.syncBootstrapPeerNodeId
      ) {
        await tx.syncPeer.updateMany({
          where: { nodeId: this.entorno.syncBootstrapPeerNodeId },
          data: {
            restauranteGlobalId: restaurante.globalId,
            sucursalGlobalId: sucursal.globalId,
            activo: true,
          },
        });
      }
      return { rolClave, restauranteGlobalId: restaurante.globalId, sucursalGlobalId: sucursal.globalId };
    });
  }

  async crearFlujoSeguridadEdge(ids: CertSecurityIds) {
    const suffix = ids.restauranteGlobalId.replace(/-/g, '').slice(0, 10);
    const rolClave = `SYNC:48D2F:${suffix}`;
    const passwordHash = await bcrypt.hash('Sync48D2F-EDGE!123', 10);
    return this.prisma.transaccionSerializable(async (tx) => {
      const restaurante = await tx.restaurante.findUniqueOrThrow({ where: { globalId: ids.restauranteGlobalId } });
      const sucursal = await tx.sucursal.findUniqueOrThrow({ where: { globalId: ids.sucursalGlobalId } });
      const rol = await tx.rol.findUniqueOrThrow({ where: { clave: rolClave } });
      const usuario = await tx.usuario.create({
        data: {
          globalId: ids.usuarioGlobalId,
          nombres: 'Usuario EDGE 48D2F',
          apellidos: 'Seguridad',
          email: `sync48d2f-${ids.usuarioGlobalId.slice(0, 8)}@example.invalid`,
          password: passwordHash,
          activo: true,
          rolId: rol.id,
          restauranteId: restaurante.id,
          sucursalId: sucursal.id,
        },
      });
      const eventos = await this.business.encolarUsuario(tx, usuario.id);
      return { usuarioGlobalId: usuario.globalId, eventos };
    });
  }

  async reencolarSeguridad(ids: CertSecurityIds) {
    return this.prisma.transaccionSerializable(async (tx) => {
      const usuario = await tx.usuario.findUniqueOrThrow({ where: { globalId: ids.usuarioGlobalId } });
      return { eventos: await this.business.encolarUsuario(tx, usuario.id) };
    });
  }

  async actualizarSeguridadCloud(ids: CertSecurityIds) {
    const suffix = ids.restauranteGlobalId.replace(/-/g, '').slice(0, 10);
    const rolClave = `SYNC:48D2F:${suffix}`;
    const passwordHash = await bcrypt.hash('Sync48D2F-CLOUD!456', 10);
    return this.prisma.transaccionSerializable(async (tx) => {
      const usuario = await tx.usuario.findUniqueOrThrow({ where: { globalId: ids.usuarioGlobalId } });
      const rol = await tx.rol.findUniqueOrThrow({ where: { clave: rolClave } });
      const manage = await tx.permiso.findUniqueOrThrow({ where: { codigo: 'SYNC48D2F_MANAGE' } });
      const view = await tx.permiso.findUniqueOrThrow({ where: { codigo: 'SYNC48D2F_VIEW' } });
      await tx.rolPermiso.deleteMany({ where: { rolId: rol.id } });
      await tx.rolPermiso.createMany({
        data: [
          { rolId: rol.id, permisoId: view.id },
          { rolId: rol.id, permisoId: manage.id },
        ],
      });
      const actualizado = await tx.usuario.update({
        where: { id: usuario.id },
        data: {
          nombres: 'Usuario CLOUD 48D2F',
          activo: false,
          password: passwordHash,
        },
      });
      const eventosRol = await this.business.encolarRolPermisos(tx, rol.id);
      const eventosUsuario = await this.business.encolarUsuario(tx, actualizado.id);
      return { eventos: { rol: eventosRol, usuario: eventosUsuario } };
    });
  }

  async estadoSeguridad(ids: CertSecurityIds) {
    const suffix = ids.restauranteGlobalId.replace(/-/g, '').slice(0, 10);
    const rolClave = `SYNC:48D2F:${suffix}`;
    const [usuario, rol] = await Promise.all([
      this.prisma.usuario.findUnique({
        where: { globalId: ids.usuarioGlobalId },
        include: { rol: true, restaurante: true, sucursal: true },
      }),
      this.prisma.rol.findUnique({
        where: { clave: rolClave },
        include: { permisos: { include: { permiso: true }, orderBy: { permisoId: 'asc' } } },
      }),
    ]);
    return {
      usuario: usuario
        ? {
            globalId: usuario.globalId,
            nombres: usuario.nombres,
            email: usuario.email,
            activo: usuario.activo,
            rolClave: usuario.rol.clave,
            restauranteGlobalId: usuario.restaurante?.globalId ?? null,
            sucursalGlobalId: usuario.sucursal?.globalId ?? null,
            passwordEdge: await bcrypt.compare('Sync48D2F-EDGE!123', usuario.password),
            passwordCloud: await bcrypt.compare('Sync48D2F-CLOUD!456', usuario.password),
          }
        : null,
      rol: rol
        ? {
            clave: rol.clave,
            nombre: rol.nombre,
            permisos: rol.permisos.filter((item) => item.permiso.activo).map((item) => item.permiso.codigo).sort(),
          }
        : null,
    };
  }



  async prepararConfiguracion(ids: CertConfigIds) {
    const suffix = ids.restauranteGlobalId.replace(/-/g, '').slice(0, 10);
    return this.prisma.transaccionSerializable(async (tx) => {
      const restaurante = await tx.restaurante.upsert({
        where: { globalId: ids.restauranteGlobalId },
        update: { estado: true },
        create: {
          globalId: ids.restauranteGlobalId,
          nombre: `SYNC CONFIG ${suffix}`,
          nit: `CFG${suffix}`.slice(0, 20),
          estado: true,
        },
      });
      const sucursal = await tx.sucursal.upsert({
        where: { globalId: ids.sucursalGlobalId },
        update: { estado: true, restauranteId: restaurante.id },
        create: {
          globalId: ids.sucursalGlobalId,
          nombre: `Sucursal Config ${suffix}`,
          estado: true,
          restauranteId: restaurante.id,
        },
      });
      if (
        this.entorno.syncRol === 'CLOUD' &&
        this.entorno.syncCertificationEnabled &&
        this.entorno.syncBootstrapPeerNodeId
      ) {
        await tx.syncPeer.updateMany({
          where: { nodeId: this.entorno.syncBootstrapPeerNodeId },
          data: {
            restauranteGlobalId: restaurante.globalId,
            sucursalGlobalId: sucursal.globalId,
            activo: true,
          },
        });
      }
      return { restauranteGlobalId: restaurante.globalId, sucursalGlobalId: sucursal.globalId };
    });
  }

  async crearFlujoConfiguracionEdge(ids: CertConfigIds) {
    return this.prisma.transaccionSerializable(async (tx) => {
      const sucursal = await tx.sucursal.findUniqueOrThrow({
        where: { globalId: ids.sucursalGlobalId },
        include: { restaurante: true },
      });
      if (sucursal.restaurante.globalId !== ids.restauranteGlobalId) {
        throw new Error('Sucursal de certificacion pertenece a otro restaurante');
      }
      const zona = await tx.configuracionSucursal.upsert({
        where: { sucursalId_clave: { sucursalId: sucursal.id, clave: 'ZONA_HORARIA' } },
        update: { valor: 'America/Bogota' },
        create: { sucursalId: sucursal.id, clave: 'ZONA_HORARIA', valor: 'America/Bogota' },
      });
      const papel = await tx.configuracionSucursal.upsert({
        where: { sucursalId_clave: { sucursalId: sucursal.id, clave: 'ANCHO_PAPEL' } },
        update: { valor: 58 },
        create: { sucursalId: sucursal.id, clave: 'ANCHO_PAPEL', valor: 58 },
      });
      const qr = await tx.configuracionSucursal.upsert({
        where: { sucursalId_clave: { sucursalId: sucursal.id, clave: 'QR_REQUIERE_ACEPTACION' } },
        update: { valor: false },
        create: { sucursalId: sucursal.id, clave: 'QR_REQUIERE_ACEPTACION', valor: false },
      });
      const eventos = {
        zona: await this.business.encolarConfiguracionSucursal(tx, zona.id),
        papel: await this.business.encolarConfiguracionSucursal(tx, papel.id),
        qr: await this.business.encolarConfiguracionSucursal(tx, qr.id),
      };
      return { eventos };
    });
  }

  async reencolarConfiguracion(ids: CertConfigIds) {
    return this.prisma.transaccionSerializable(async (tx) => {
      const sucursal = await tx.sucursal.findUniqueOrThrow({ where: { globalId: ids.sucursalGlobalId } });
      const items = await tx.configuracionSucursal.findMany({
        where: { sucursalId: sucursal.id, clave: { in: ['ZONA_HORARIA', 'ANCHO_PAPEL', 'QR_REQUIERE_ACEPTACION'] } },
      });
      let eventos = 0;
      for (const item of items) eventos += await this.business.encolarConfiguracionSucursal(tx, item.id);
      return { eventos };
    });
  }

  async actualizarConfiguracionCloud(ids: CertConfigIds) {
    return this.prisma.transaccionSerializable(async (tx) => {
      const restaurante = await tx.restaurante.findUniqueOrThrow({ where: { globalId: ids.restauranteGlobalId } });
      const sucursal = await tx.sucursal.findUniqueOrThrow({ where: { globalId: ids.sucursalGlobalId } });
      if (sucursal.restauranteId !== restaurante.id) throw new Error('Sucursal fuera del restaurante de certificacion');

      const moneda = await tx.configuracionRestaurante.upsert({
        where: { restauranteId_clave: { restauranteId: restaurante.id, clave: 'MONEDA' } },
        update: { valor: 'COP' },
        create: { restauranteId: restaurante.id, clave: 'MONEDA', valor: 'COP' },
      });
      const impuesto = await tx.configuracionRestaurante.upsert({
        where: { restauranteId_clave: { restauranteId: restaurante.id, clave: 'PORCENTAJE_IMPUESTO' } },
        update: { valor: 19 },
        create: { restauranteId: restaurante.id, clave: 'PORCENTAJE_IMPUESTO', valor: 19 },
      });
      const tema = await tx.configuracionRestaurante.upsert({
        where: { restauranteId_clave: { restauranteId: restaurante.id, clave: 'TEMA_COLOR_ACENTO' } },
        update: { valor: '#112233' },
        create: { restauranteId: restaurante.id, clave: 'TEMA_COLOR_ACENTO', valor: '#112233' },
      });
      const papel = await tx.configuracionSucursal.upsert({
        where: { sucursalId_clave: { sucursalId: sucursal.id, clave: 'ANCHO_PAPEL' } },
        update: { valor: 80 },
        create: { sucursalId: sucursal.id, clave: 'ANCHO_PAPEL', valor: 80 },
      });
      const qr = await tx.configuracionSucursal.upsert({
        where: { sucursalId_clave: { sucursalId: sucursal.id, clave: 'QR_REQUIERE_ACEPTACION' } },
        update: { valor: true },
        create: { sucursalId: sucursal.id, clave: 'QR_REQUIERE_ACEPTACION', valor: true },
      });
      const eventos = {
        moneda: await this.business.encolarConfiguracionRestaurante(tx, moneda.id),
        impuesto: await this.business.encolarConfiguracionRestaurante(tx, impuesto.id),
        tema: await this.business.encolarConfiguracionRestaurante(tx, tema.id),
        papel: await this.business.encolarConfiguracionSucursal(tx, papel.id),
        qr: await this.business.encolarConfiguracionSucursal(tx, qr.id),
      };
      return { eventos };
    });
  }

  async estadoConfiguracion(ids: CertConfigIds) {
    const restaurante = await this.prisma.restaurante.findUnique({ where: { globalId: ids.restauranteGlobalId } });
    const sucursal = await this.prisma.sucursal.findUnique({ where: { globalId: ids.sucursalGlobalId } });
    if (!restaurante || !sucursal || sucursal.restauranteId !== restaurante.id) {
      return { restaurante: null, sucursal: null, efectiva: null };
    }
    const [restItems, sucItems] = await Promise.all([
      this.prisma.configuracionRestaurante.findMany({ where: { restauranteId: restaurante.id } }),
      this.prisma.configuracionSucursal.findMany({ where: { sucursalId: sucursal.id } }),
    ]);
    const restauranteValores = Object.fromEntries(restItems.map((x) => [x.clave, x.valor]));
    const sucursalValores = Object.fromEntries(sucItems.map((x) => [x.clave, x.valor]));
    return {
      restaurante: restauranteValores,
      sucursal: sucursalValores,
      efectiva: { ...restauranteValores, ...sucursalValores },
    };
  }

  async estado(pedidoGlobalId: string, comandaGlobalId: string, domicilioGlobalId: string) {
    const [pedido, comanda, domicilio] = await Promise.all([
      this.prisma.pedido.findUnique({
        where: { globalId: pedidoGlobalId },
        include: { detalles: true },
      }),
      this.prisma.comanda.findUnique({
        where: { globalId: comandaGlobalId },
        include: { detalles: true },
      }),
      this.prisma.domicilio.findUnique({ where: { globalId: domicilioGlobalId } }),
    ]);
    return {
      pedido: pedido
        ? { globalId: pedido.globalId, estado: pedido.estado, detalles: pedido.detalles.length }
        : null,
      comanda: comanda
        ? {
            globalId: comanda.globalId,
            estado: comanda.estado,
            detalles: comanda.detalles.length,
            detalleEstado: comanda.detalles[0]?.estado ?? null,
          }
        : null,
      domicilio: domicilio
        ? {
            globalId: domicilio.globalId,
            estado: domicilio.estado,
            observacion: domicilio.observacion,
          }
        : null,
    };
  }
}
