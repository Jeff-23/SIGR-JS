import { Injectable } from '@nestjs/common';
import { Prisma, RolNodoSync } from '@prisma/client';
import { obtenerEntorno } from '../../config/entorno';
import { PrismaService } from '../../prisma/prisma.service';
import { SyncOutboxService } from './sync-outbox.service';

@Injectable()
export class SyncBusinessService {
  private readonly entorno = obtenerEntorno();

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: SyncOutboxService,
  ) {}

  async encolarPedido(
    tx: Prisma.TransactionClient,
    pedidoId: number,
  ): Promise<number> {
    if (!this.entorno.syncHabilitado) return 0;
    const pedido = await tx.pedido.findUnique({
      where: { id: pedidoId },
      include: {
        sucursal: { include: { restaurante: true } },
        mesa: true,
        usuario: true,
        mesero: true,
        detalles: {
          include: { producto: true, modificadores: true },
          orderBy: { id: 'asc' },
        },
      },
    });
    if (!pedido) return 0;

    const payload = {
      globalId: pedido.globalId,
      sucursalGlobalId: pedido.sucursal.globalId,
      restauranteGlobalId: pedido.sucursal.restaurante.globalId,
      mesaGlobalId: pedido.mesa?.globalId ?? null,
      usuarioGlobalId: pedido.usuario?.globalId ?? null,
      meseroGlobalId: pedido.mesero?.globalId ?? null,
      total: pedido.total.toString(),
      tipo: pedido.tipo,
      estado: pedido.estado,
      personas: pedido.personas,
      observaciones: pedido.observaciones,
      creadoEn: pedido.creadoEn.toISOString(),
      detalles: pedido.detalles.map((detalle) => ({
        globalId: detalle.globalId,
        productoGlobalId: detalle.producto.globalId,
        cantidad: detalle.cantidad,
        precioUnitario: detalle.precioUnitario.toString(),
        subtotal: detalle.subtotal.toString(),
        observaciones: detalle.observaciones,
        modificadores: detalle.modificadores.map((modificador) => ({
          nombre: modificador.nombre,
          precioUnitario: modificador.precioUnitario.toString(),
          cantidad: modificador.cantidad,
          subtotal: modificador.subtotal.toString(),
        })),
      })),
    } satisfies Prisma.InputJsonObject;

    return this.encolarParaDestinos(
      tx,
      pedido.sucursal.restaurante.globalId,
      pedido.sucursal.globalId,
      'PEDIDO',
      pedido.globalId,
      'PEDIDO.SNAPSHOT_V1',
      payload,
    );
  }

  async encolarComanda(
    tx: Prisma.TransactionClient,
    comandaId: number,
  ): Promise<number> {
    if (!this.entorno.syncHabilitado) return 0;
    const comanda = await tx.comanda.findUnique({
      where: { id: comandaId },
      include: {
        estacion: true,
        vistoPor: true,
        ultimaSolicitudImpresionPor: true,
        pedido: { include: { sucursal: { include: { restaurante: true } } } },
        detalles: {
          include: { detallePedido: true },
          orderBy: { id: 'asc' },
        },
      },
    });
    if (!comanda) return 0;

    const payload = {
      globalId: comanda.globalId,
      pedidoGlobalId: comanda.pedido.globalId,
      estacionGlobalId: comanda.estacion.globalId,
      vistoPorGlobalId: comanda.vistoPor?.globalId ?? null,
      ultimaSolicitudImpresionPorGlobalId:
        comanda.ultimaSolicitudImpresionPor?.globalId ?? null,
      estado: comanda.estado,
      prioridad: comanda.prioridad,
      fechaEnvio: comanda.fechaEnvio.toISOString(),
      fechaVista: comanda.fechaVista?.toISOString() ?? null,
      fechaInicio: comanda.fechaInicio?.toISOString() ?? null,
      fechaLista: comanda.fechaLista?.toISOString() ?? null,
      fechaEntrega: comanda.fechaEntrega?.toISOString() ?? null,
      solicitudesImpresion: comanda.solicitudesImpresion,
      fechaUltimaSolicitudImpresion:
        comanda.fechaUltimaSolicitudImpresion?.toISOString() ?? null,
      metaPreparacionMin: comanda.metaPreparacionMin,
      detalles: comanda.detalles.map((detalle) => ({
        globalId: detalle.globalId,
        detallePedidoGlobalId: detalle.detallePedido.globalId,
        cantidad: detalle.cantidad,
        estado: detalle.estado,
        fechaInicio: detalle.fechaInicio?.toISOString() ?? null,
        fechaLista: detalle.fechaLista?.toISOString() ?? null,
      })),
    } satisfies Prisma.InputJsonObject;

    return this.encolarParaDestinos(
      tx,
      comanda.pedido.sucursal.restaurante.globalId,
      comanda.pedido.sucursal.globalId,
      'COMANDA',
      comanda.globalId,
      'COMANDA.SNAPSHOT_V1',
      payload,
    );
  }

  async encolarDomicilio(
    tx: Prisma.TransactionClient,
    domicilioId: number,
  ): Promise<number> {
    if (!this.entorno.syncHabilitado) return 0;
    const domicilio = await tx.domicilio.findUnique({
      where: { id: domicilioId },
      include: {
        repartidor: true,
        pedido: { include: { sucursal: { include: { restaurante: true } } } },
      },
    });
    if (!domicilio) return 0;

    const payload = {
      globalId: domicilio.globalId,
      pedidoGlobalId: domicilio.pedido.globalId,
      repartidorGlobalId: domicilio.repartidor?.globalId ?? null,
      estado: domicilio.estado,
      destinatario: domicilio.destinatario,
      telefono: domicilio.telefono,
      direccion: domicilio.direccion,
      referencias: domicilio.referencias,
      costo: domicilio.costo.toString(),
      asignadoEn: domicilio.asignadoEn?.toISOString() ?? null,
      enRutaEn: domicilio.enRutaEn?.toISOString() ?? null,
      entregadoEn: domicilio.entregadoEn?.toISOString() ?? null,
      observacion: domicilio.observacion,
      creadoEn: domicilio.creadoEn.toISOString(),
      actualizadoEn: domicilio.actualizadoEn.toISOString(),
    } satisfies Prisma.InputJsonObject;

    return this.encolarParaDestinos(
      tx,
      domicilio.pedido.sucursal.restaurante.globalId,
      domicilio.pedido.sucursal.globalId,
      'DOMICILIO',
      domicilio.globalId,
      'DOMICILIO.SNAPSHOT_V1',
      payload,
    );
  }


  async encolarVenta(tx: Prisma.TransactionClient, ventaId: number): Promise<number> {
    if (!this.entorno.syncHabilitado) return 0;
    const venta = await tx.venta.findUnique({
      where: { id: ventaId },
      include: {
        sucursal: { include: { restaurante: true } },
        usuario: true,
        pedido: true,
        cliente: true,
        detalles: { include: { producto: true }, orderBy: { id: 'asc' } },
      },
    });
    if (!venta) return 0;
    const payload = {
      globalId: venta.globalId,
      restauranteGlobalId: venta.sucursal.restaurante.globalId,
      sucursalGlobalId: venta.sucursal.globalId,
      usuarioGlobalId: venta.usuario.globalId,
      pedidoGlobalId: venta.pedido?.globalId ?? null,
      clienteGlobalId: venta.cliente?.globalId ?? null,
      origen: venta.origen,
      estado: venta.estado,
      subtotal: venta.subtotal.toString(),
      descuentos: venta.descuentos.toString(),
      impuestos: venta.impuestos.toString(),
      impoconsumo: venta.impoconsumo.toString(),
      propina: venta.propina.toString(),
      domicilioCosto: venta.domicilioCosto.toString(),
      total: venta.total.toString(),
      fechaOperacion: venta.fechaOperacion.toISOString(),
      numeroComandaPapel: venta.numeroComandaPapel,
      numeroSoporte: venta.numeroSoporte,
      soporteArchivoRef: venta.soporteArchivoRef,
      idempotenciaClave: venta.idempotenciaClave,
      idempotenciaHash: venta.idempotenciaHash,
      detalles: venta.detalles.map((d) => ({
        globalId: d.globalId,
        productoGlobalId: d.producto.globalId,
        cantidad: d.cantidad,
        precioUnitario: d.precioUnitario.toString(),
        subtotal: d.subtotal.toString(),
      })),
    } satisfies Prisma.InputJsonObject;
    return this.encolarParaDestinos(tx, venta.sucursal.restaurante.globalId, venta.sucursal.globalId, 'VENTA', venta.globalId, 'VENTA.SNAPSHOT_V1', payload);
  }

  async encolarCaja(tx: Prisma.TransactionClient, cajaId: number): Promise<number> {
    if (!this.entorno.syncHabilitado) return 0;
    const caja = await tx.caja.findUnique({
      where: { id: cajaId },
      include: { sucursal: { include: { restaurante: true } }, abiertaPor: true, cerradaPor: true },
    });
    if (!caja) return 0;
    const payload = {
      globalId: caja.globalId,
      restauranteGlobalId: caja.sucursal.restaurante.globalId,
      sucursalGlobalId: caja.sucursal.globalId,
      abiertaPorGlobalId: caja.abiertaPor.globalId,
      cerradaPorGlobalId: caja.cerradaPor?.globalId ?? null,
      nombre: caja.nombre,
      estado: caja.estado,
      saldoInicial: caja.saldoInicial.toString(),
      saldoEsperado: caja.saldoEsperado?.toString() ?? null,
      saldoContado: caja.saldoContado?.toString() ?? null,
      diferencia: caja.diferencia?.toString() ?? null,
      totalEfectivoSistema: caja.totalEfectivoSistema?.toString() ?? null,
      totalOtrosPagos: caja.totalOtrosPagos?.toString() ?? null,
      totalIngresos: caja.totalIngresos?.toString() ?? null,
      totalEgresos: caja.totalEgresos?.toString() ?? null,
      fechaApertura: caja.fechaApertura.toISOString(),
      fechaCierre: caja.fechaCierre?.toISOString() ?? null,
      observacionApertura: caja.observacionApertura,
      observacionCierre: caja.observacionCierre,
      aperturaClave: caja.aperturaClave,
      aperturaHash: caja.aperturaHash,
      cierreClave: caja.cierreClave,
      cierreHash: caja.cierreHash,
    } satisfies Prisma.InputJsonObject;
    return this.encolarParaDestinos(tx, caja.sucursal.restaurante.globalId, caja.sucursal.globalId, 'CAJA', caja.globalId, 'CAJA.SNAPSHOT_V1', payload);
  }

  async encolarPago(tx: Prisma.TransactionClient, pagoId: number): Promise<number> {
    if (!this.entorno.syncHabilitado) return 0;
    const pago = await tx.pago.findUnique({
      where: { id: pagoId },
      include: {
        venta: { include: { sucursal: { include: { restaurante: true } } } },
        metodoPago: true,
        caja: true,
        usuario: true,
      },
    });
    if (!pago?.venta) return 0;
    const payload = {
      globalId: pago.globalId,
      restauranteGlobalId: pago.venta.sucursal.restaurante.globalId,
      sucursalGlobalId: pago.venta.sucursal.globalId,
      ventaGlobalId: pago.venta.globalId,
      metodoPagoGlobalId: pago.metodoPago.globalId,
      cajaGlobalId: pago.caja?.globalId ?? null,
      usuarioGlobalId: pago.usuario?.globalId ?? null,
      monto: pago.monto.toString(),
      referencia: pago.referencia,
      creadoEn: pago.creadoEn.toISOString(),
      idempotenciaClave: pago.idempotenciaClave,
      idempotenciaHash: pago.idempotenciaHash,
    } satisfies Prisma.InputJsonObject;
    return this.encolarParaDestinos(tx, pago.venta.sucursal.restaurante.globalId, pago.venta.sucursal.globalId, 'PAGO', pago.globalId, 'PAGO.SNAPSHOT_V1', payload);
  }

  async encolarMovimientoCaja(tx: Prisma.TransactionClient, movimientoId: number): Promise<number> {
    if (!this.entorno.syncHabilitado) return 0;
    const movimiento = await tx.movimientoCaja.findUnique({
      where: { id: movimientoId },
      include: {
        caja: { include: { sucursal: { include: { restaurante: true } } } },
        usuario: true,
      },
    });
    if (!movimiento) return 0;
    const payload = {
      globalId: movimiento.globalId,
      restauranteGlobalId: movimiento.caja.sucursal.restaurante.globalId,
      sucursalGlobalId: movimiento.caja.sucursal.globalId,
      cajaGlobalId: movimiento.caja.globalId,
      usuarioGlobalId: movimiento.usuario.globalId,
      tipo: movimiento.tipo,
      monto: movimiento.monto.toString(),
      concepto: movimiento.concepto,
      observacion: movimiento.observacion,
      creadoEn: movimiento.creadoEn.toISOString(),
      idempotenciaClave: movimiento.idempotenciaClave,
      idempotenciaHash: movimiento.idempotenciaHash,
    } satisfies Prisma.InputJsonObject;
    return this.encolarParaDestinos(tx, movimiento.caja.sucursal.restaurante.globalId, movimiento.caja.sucursal.globalId, 'MOVIMIENTO_CAJA', movimiento.globalId, 'MOVIMIENTO_CAJA.SNAPSHOT_V1', payload);
  }



  async encolarCliente(tx: Prisma.TransactionClient, clienteId: number): Promise<number> {
    if (!this.entorno.syncHabilitado) return 0;
    const cliente = await tx.cliente.findUnique({
      where: { id: clienteId },
      include: { restaurante: true },
    });
    if (!cliente) return 0;
    const sucursalGlobalId = await this.sucursalRepresentativa(tx, cliente.restauranteId);
    if (!sucursalGlobalId) return 0;
    const payload = {
      globalId: cliente.globalId,
      restauranteGlobalId: cliente.restaurante.globalId,
      tipoDocumento: cliente.tipoDocumento,
      numeroDocumento: cliente.numeroDocumento,
      nombres: cliente.nombres,
      apellidos: cliente.apellidos,
      telefono: cliente.telefono,
      correo: cliente.correo,
      direccion: cliente.direccion,
      fechaNacimiento: cliente.fechaNacimiento?.toISOString() ?? null,
      estado: cliente.estado,
      creadoEn: cliente.creadoEn.toISOString(),
      actualizadoEn: cliente.actualizadoEn.toISOString(),
    } satisfies Prisma.InputJsonObject;
    return this.encolarParaDestinos(tx, cliente.restaurante.globalId, sucursalGlobalId, 'CLIENTE', cliente.globalId, 'CLIENTE.SNAPSHOT_V1', payload);
  }

  async encolarNivelFidelizacion(tx: Prisma.TransactionClient, nivelId: number): Promise<number> {
    if (!this.entorno.syncHabilitado) return 0;
    const nivel = await tx.nivelFidelizacion.findUnique({ where: { id: nivelId }, include: { restaurante: true } });
    if (!nivel) return 0;
    const sucursalGlobalId = await this.sucursalRepresentativa(tx, nivel.restauranteId);
    if (!sucursalGlobalId) return 0;
    const payload = {
      globalId: nivel.globalId,
      restauranteGlobalId: nivel.restaurante.globalId,
      nombre: nivel.nombre,
      puntosMinimos: nivel.puntosMinimos,
      multiplicador: nivel.multiplicador.toString(),
      beneficios: nivel.beneficios ?? null,
      activo: nivel.activo,
      creadoEn: nivel.creadoEn.toISOString(),
    } satisfies Prisma.InputJsonObject;
    return this.encolarParaDestinos(tx, nivel.restaurante.globalId, sucursalGlobalId, 'NIVEL_FIDELIZACION', nivel.globalId, 'NIVEL_FIDELIZACION.SNAPSHOT_V1', payload);
  }

  async encolarCuentaFidelizacion(tx: Prisma.TransactionClient, cuentaId: number): Promise<number> {
    if (!this.entorno.syncHabilitado) return 0;
    const cuenta = await tx.cuentaFidelizacion.findUnique({
      where: { id: cuentaId },
      include: { cliente: { include: { restaurante: true } }, nivel: true },
    });
    if (!cuenta) return 0;
    const sucursalGlobalId = await this.sucursalRepresentativa(tx, cuenta.cliente.restauranteId);
    if (!sucursalGlobalId) return 0;
    const payload = {
      globalId: cuenta.globalId,
      restauranteGlobalId: cuenta.cliente.restaurante.globalId,
      clienteGlobalId: cuenta.cliente.globalId,
      nivelGlobalId: cuenta.nivel?.globalId ?? null,
      saldoPuntos: cuenta.saldoPuntos,
      puntosHistoricos: cuenta.puntosHistoricos,
      actualizadoEn: cuenta.actualizadoEn.toISOString(),
    } satisfies Prisma.InputJsonObject;
    return this.encolarParaDestinos(tx, cuenta.cliente.restaurante.globalId, sucursalGlobalId, 'CUENTA_FIDELIZACION', cuenta.globalId, 'CUENTA_FIDELIZACION.SNAPSHOT_V1', payload);
  }

  async encolarMovimientoPuntos(tx: Prisma.TransactionClient, movimientoId: number): Promise<number> {
    if (!this.entorno.syncHabilitado) return 0;
    const mov = await tx.movimientoPuntos.findUnique({
      where: { id: movimientoId },
      include: {
        cuenta: { include: { cliente: { include: { restaurante: true } } } },
        venta: true,
        usuario: true,
      },
    });
    if (!mov) return 0;
    const sucursalGlobalId = await this.sucursalRepresentativa(tx, mov.cuenta.cliente.restauranteId);
    if (!sucursalGlobalId) return 0;
    const payload = {
      globalId: mov.globalId,
      restauranteGlobalId: mov.cuenta.cliente.restaurante.globalId,
      cuentaGlobalId: mov.cuenta.globalId,
      ventaGlobalId: mov.venta?.globalId ?? null,
      usuarioGlobalId: mov.usuario?.globalId ?? null,
      tipo: mov.tipo,
      puntos: mov.puntos,
      saldoPosterior: mov.saldoPosterior,
      motivo: mov.motivo,
      creadoEn: mov.creadoEn.toISOString(),
    } satisfies Prisma.InputJsonObject;
    return this.encolarParaDestinos(tx, mov.cuenta.cliente.restaurante.globalId, sucursalGlobalId, 'MOVIMIENTO_PUNTOS', mov.globalId, 'MOVIMIENTO_PUNTOS.SNAPSHOT_V1', payload);
  }

  async encolarConsentimientoCliente(tx: Prisma.TransactionClient, consentimientoId: number): Promise<number> {
    if (!this.entorno.syncHabilitado) return 0;
    const cons = await tx.consentimientoCliente.findUnique({
      where: { id: consentimientoId },
      include: { cliente: { include: { restaurante: true } }, usuario: true },
    });
    if (!cons) return 0;
    const sucursalGlobalId = await this.sucursalRepresentativa(tx, cons.cliente.restauranteId);
    if (!sucursalGlobalId) return 0;
    const payload = {
      globalId: cons.globalId,
      restauranteGlobalId: cons.cliente.restaurante.globalId,
      clienteGlobalId: cons.cliente.globalId,
      usuarioGlobalId: cons.usuario.globalId,
      canal: cons.canal,
      otorgado: cons.otorgado,
      fuente: cons.fuente,
      registradoEn: cons.registradoEn.toISOString(),
      revocadoEn: cons.revocadoEn?.toISOString() ?? null,
    } satisfies Prisma.InputJsonObject;
    return this.encolarParaDestinos(tx, cons.cliente.restaurante.globalId, sucursalGlobalId, 'CONSENTIMIENTO_CLIENTE', cons.globalId, 'CONSENTIMIENTO_CLIENTE.SNAPSHOT_V1', payload);
  }

  private async sucursalRepresentativa(tx: Prisma.TransactionClient, restauranteId: number): Promise<string | null> {
    const sucursal = await tx.sucursal.findFirst({
      where: { restauranteId, estado: true },
      orderBy: { id: 'asc' },
      select: { globalId: true },
    });
    return sucursal?.globalId ?? null;
  }

  async encolarArticulo(
    tx: Prisma.TransactionClient,
    articuloId: number,
  ): Promise<number> {
    if (!this.entorno.syncHabilitado) return 0;
    const articulo = await tx.articulo.findUnique({
      where: { id: articuloId },
      include: { sucursal: { include: { restaurante: true } } },
    });
    if (!articulo) return 0;

    // El stock no viaja en el snapshot maestro del articulo. El stock converge
    // exclusivamente mediante MOVIMIENTO_INVENTARIO para evitar que un snapshot
    // atrasado revierta un movimiento mas reciente.
    const payload = {
      globalId: articulo.globalId,
      restauranteGlobalId: articulo.sucursal.restaurante.globalId,
      sucursalGlobalId: articulo.sucursal.globalId,
      nombre: articulo.nombre,
      unidad: articulo.unidad,
      costoUnidad: articulo.costoUnidad.toString(),
      stockMinimo: articulo.stockMinimo.toString(),
      diasAnticipacion: articulo.diasAnticipacion,
      estado: articulo.estado,
      creadoEn: articulo.creadoEn.toISOString(),
    } satisfies Prisma.InputJsonObject;

    return this.encolarParaDestinos(
      tx,
      articulo.sucursal.restaurante.globalId,
      articulo.sucursal.globalId,
      'ARTICULO',
      articulo.globalId,
      'ARTICULO.SNAPSHOT_V1',
      payload,
    );
  }

  async encolarMovimientoInventario(
    tx: Prisma.TransactionClient,
    movimientoId: number,
  ): Promise<number> {
    if (!this.entorno.syncHabilitado) return 0;
    const movimiento = await tx.movimientoInventario.findUnique({
      where: { id: movimientoId },
      include: {
        sucursal: { include: { restaurante: true } },
        usuario: true,
        venta: true,
        producto: true,
        articulo: true,
        movimientoOrigen: true,
      },
    });
    if (!movimiento) return 0;

    const payload = {
      globalId: movimiento.globalId,
      restauranteGlobalId: movimiento.sucursal.restaurante.globalId,
      sucursalGlobalId: movimiento.sucursal.globalId,
      usuarioGlobalId: movimiento.usuario.globalId,
      ventaGlobalId: movimiento.venta?.globalId ?? null,
      productoGlobalId: movimiento.producto?.globalId ?? null,
      articuloGlobalId: movimiento.articulo?.globalId ?? null,
      movimientoOrigenGlobalId: movimiento.movimientoOrigen?.globalId ?? null,
      tipo: movimiento.tipo,
      cantidad: movimiento.cantidad.toString(),
      unidad: movimiento.unidad,
      stockAnterior: movimiento.stockAnterior.toString(),
      stockNuevo: movimiento.stockNuevo.toString(),
      motivo: movimiento.motivo,
      creadoEn: movimiento.creadoEn.toISOString(),
    } satisfies Prisma.InputJsonObject;

    return this.encolarParaDestinos(
      tx,
      movimiento.sucursal.restaurante.globalId,
      movimiento.sucursal.globalId,
      'MOVIMIENTO_INVENTARIO',
      movimiento.globalId,
      'MOVIMIENTO_INVENTARIO.SNAPSHOT_V1',
      payload,
    );
  }


  async encolarCategoria(
    tx: Prisma.TransactionClient,
    categoriaId: number,
  ): Promise<number> {
    if (!this.entorno.syncHabilitado) return 0;
    const categoria = await tx.categoria.findUnique({
      where: { id: categoriaId },
      include: { sucursal: { include: { restaurante: true } } },
    });
    if (!categoria) return 0;
    const payload = {
      globalId: categoria.globalId,
      restauranteGlobalId: categoria.sucursal.restaurante.globalId,
      sucursalGlobalId: categoria.sucursal.globalId,
      nombre: categoria.nombre,
      estado: categoria.estado,
      creadoEn: categoria.creadoEn.toISOString(),
    } satisfies Prisma.InputJsonObject;
    return this.encolarParaDestinos(
      tx,
      categoria.sucursal.restaurante.globalId,
      categoria.sucursal.globalId,
      'CATEGORIA',
      categoria.globalId,
      'CATEGORIA.SNAPSHOT_V1',
      payload,
    );
  }

  async encolarProducto(
    tx: Prisma.TransactionClient,
    productoId: number,
  ): Promise<number> {
    if (!this.entorno.syncHabilitado) return 0;
    const producto = await tx.producto.findUnique({
      where: { id: productoId },
      include: {
        categoria: { include: { sucursal: { include: { restaurante: true } } } },
        estacion: true,
        modificadores: { orderBy: [{ orden: 'asc' }, { id: 'asc' }] },
      },
    });
    if (!producto) return 0;
    const payload = {
      globalId: producto.globalId,
      restauranteGlobalId: producto.categoria.sucursal.restaurante.globalId,
      sucursalGlobalId: producto.categoria.sucursal.globalId,
      categoriaGlobalId: producto.categoria.globalId,
      estacionGlobalId: producto.estacion?.globalId ?? null,
      codigo: producto.codigo,
      nombre: producto.nombre,
      descripcion: producto.descripcion,
      precio: producto.precio.toString(),
      favorito: producto.favorito,
      disponible: producto.disponible,
      estrategiaInventario: producto.estrategiaInventario,
      unidadInventario: producto.unidadInventario,
      rendimientoPorcentaje: producto.rendimientoPorcentaje.toString(),
      estado: producto.estado,
      creadoEn: producto.creadoEn.toISOString(),
      modificadores: producto.modificadores.map((m) => ({
        nombre: m.nombre,
        precio: m.precio.toString(),
        activo: m.activo,
        orden: m.orden,
      })),
    } satisfies Prisma.InputJsonObject;
    return this.encolarParaDestinos(
      tx,
      producto.categoria.sucursal.restaurante.globalId,
      producto.categoria.sucursal.globalId,
      'PRODUCTO',
      producto.globalId,
      'PRODUCTO.SNAPSHOT_V1',
      payload,
    );
  }

  async encolarZona(
    tx: Prisma.TransactionClient,
    zonaId: number,
  ): Promise<number> {
    if (!this.entorno.syncHabilitado) return 0;
    const zona = await tx.zona.findUnique({
      where: { id: zonaId },
      include: { sucursal: { include: { restaurante: true } } },
    });
    if (!zona) return 0;
    const payload = {
      globalId: zona.globalId,
      restauranteGlobalId: zona.sucursal.restaurante.globalId,
      sucursalGlobalId: zona.sucursal.globalId,
      nombre: zona.nombre,
      estado: zona.estado,
      creadoEn: zona.creadoEn.toISOString(),
    } satisfies Prisma.InputJsonObject;
    return this.encolarParaDestinos(
      tx,
      zona.sucursal.restaurante.globalId,
      zona.sucursal.globalId,
      'ZONA',
      zona.globalId,
      'ZONA.SNAPSHOT_V1',
      payload,
    );
  }

  async encolarMesa(
    tx: Prisma.TransactionClient,
    mesaId: number,
  ): Promise<number> {
    if (!this.entorno.syncHabilitado) return 0;
    const mesa = await tx.mesa.findUnique({
      where: { id: mesaId },
      include: { zona: { include: { sucursal: { include: { restaurante: true } } } } },
    });
    if (!mesa) return 0;
    const payload = {
      globalId: mesa.globalId,
      restauranteGlobalId: mesa.zona.sucursal.restaurante.globalId,
      sucursalGlobalId: mesa.zona.sucursal.globalId,
      zonaGlobalId: mesa.zona.globalId,
      numero: mesa.numero,
      capacidad: mesa.capacidad,
      forma: mesa.forma,
      orientacion: mesa.orientacion,
      tamanoVisual: mesa.tamanoVisual,
      estado: mesa.estado,
      creadoEn: mesa.creadoEn.toISOString(),
    } satisfies Prisma.InputJsonObject;
    return this.encolarParaDestinos(
      tx,
      mesa.zona.sucursal.restaurante.globalId,
      mesa.zona.sucursal.globalId,
      'MESA',
      mesa.globalId,
      'MESA.SNAPSHOT_V1',
      payload,
    );
  }


  async encolarUsuario(
    tx: Prisma.TransactionClient,
    usuarioId: number,
  ): Promise<number> {
    if (!this.entorno.syncHabilitado) return 0;
    const usuario = await tx.usuario.findUnique({
      where: { id: usuarioId },
      include: {
        rol: true,
        restaurante: true,
        sucursal: true,
      },
    });
    if (!usuario || !usuario.restaurante) return 0;
    if (usuario.rol.ambito !== 'RESTAURANTE' || usuario.rol.restauranteId !== usuario.restauranteId) {
      throw new Error('Usuario tenant tiene un rol fuera de su restaurante');
    }

    const payload = {
      globalId: usuario.globalId,
      restauranteGlobalId: usuario.restaurante.globalId,
      sucursalGlobalId: usuario.sucursal?.globalId ?? null,
      rolClave: usuario.rol.clave,
      nombres: usuario.nombres,
      apellidos: usuario.apellidos,
      email: usuario.email,
      passwordHash: usuario.password,
      activo: usuario.activo,
      creadoEn: usuario.creadoEn.toISOString(),
    } satisfies Prisma.InputJsonObject;

    if (this.entorno.syncRol === 'CLOUD' && usuario.sucursal === null) {
      return this.encolarCloudParaRestaurante(
        tx,
        usuario.restaurante.globalId,
        'USUARIO',
        usuario.globalId,
        'USUARIO.SNAPSHOT_V1',
        payload,
      );
    }

    if (this.entorno.syncRol === 'EDGE' && usuario.sucursal === null) {
      throw new Error(
        'Usuarios de alcance restaurante deben administrarse desde CLOUD en modo hibrido',
      );
    }

    return this.encolarParaDestinos(
      tx,
      usuario.restaurante.globalId,
      usuario.sucursal!.globalId,
      'USUARIO',
      usuario.globalId,
      'USUARIO.SNAPSHOT_V1',
      payload,
    );
  }

  async encolarRolPermisos(
    tx: Prisma.TransactionClient,
    rolId: number,
  ): Promise<number> {
    if (!this.entorno.syncHabilitado || this.entorno.syncRol !== 'CLOUD') return 0;
    const rol = await tx.rol.findUnique({
      where: { id: rolId },
      include: {
        restaurante: true,
        permisos: {
          include: { permiso: true },
          orderBy: { permisoId: 'asc' },
        },
      },
    });
    if (!rol || !rol.restaurante || rol.ambito !== 'RESTAURANTE') return 0;

    const payload = {
      restauranteGlobalId: rol.restaurante.globalId,
      clave: rol.clave,
      nombre: rol.nombre,
      descripcion: rol.descripcion,
      permisos: rol.permisos
        .filter((item) => item.permiso.activo)
        .map((item) => item.permiso.codigo),
    } satisfies Prisma.InputJsonObject;

    return this.encolarCloudParaRestaurante(
      tx,
      rol.restaurante.globalId,
      'ROL_PERMISOS',
      null,
      'ROL_PERMISOS.SNAPSHOT_V1',
      payload,
    );
  }


  async encolarConfiguracionRestaurante(
    tx: Prisma.TransactionClient,
    configuracionId: number,
  ): Promise<number> {
    if (!this.entorno.syncHabilitado) return 0;
    if (this.entorno.syncRol === 'EDGE') {
      throw new Error(
        'La configuracion de restaurante es autoritativa en CLOUD en modo hibrido',
      );
    }
    const configuracion = await tx.configuracionRestaurante.findUnique({
      where: { id: configuracionId },
      include: { restaurante: true },
    });
    if (!configuracion) return 0;
    const payload = {
      restauranteGlobalId: configuracion.restaurante.globalId,
      clave: configuracion.clave,
      valor: configuracion.valor as Prisma.InputJsonValue,
    } satisfies Prisma.InputJsonObject;
    return this.encolarCloudParaRestaurante(
      tx,
      configuracion.restaurante.globalId,
      'CONFIGURACION_RESTAURANTE',
      configuracion.restaurante.globalId,
      'CONFIGURACION_RESTAURANTE.SNAPSHOT_V1',
      payload,
    );
  }

  async encolarConfiguracionSucursal(
    tx: Prisma.TransactionClient,
    configuracionId: number,
  ): Promise<number> {
    if (!this.entorno.syncHabilitado) return 0;
    const configuracion = await tx.configuracionSucursal.findUnique({
      where: { id: configuracionId },
      include: { sucursal: { include: { restaurante: true } } },
    });
    if (!configuracion) return 0;
    const payload = {
      restauranteGlobalId: configuracion.sucursal.restaurante.globalId,
      sucursalGlobalId: configuracion.sucursal.globalId,
      clave: configuracion.clave,
      valor: configuracion.valor as Prisma.InputJsonValue,
    } satisfies Prisma.InputJsonObject;
    return this.encolarParaDestinos(
      tx,
      configuracion.sucursal.restaurante.globalId,
      configuracion.sucursal.globalId,
      'CONFIGURACION_SUCURSAL',
      configuracion.sucursal.globalId,
      'CONFIGURACION_SUCURSAL.SNAPSHOT_V1',
      payload,
    );
  }

  private async encolarCloudParaRestaurante(
    tx: Prisma.TransactionClient,
    restauranteGlobalId: string,
    aggregateType: string,
    aggregateGlobalId: string | null,
    eventType: string,
    payload: Prisma.InputJsonObject,
  ): Promise<number> {
    if (!this.entorno.syncHabilitado || this.entorno.syncRol !== 'CLOUD') return 0;
    const peers = await tx.syncPeer.findMany({
      where: {
        activo: true,
        rol: RolNodoSync.EDGE,
        OR: [
          { restauranteGlobalId },
          ...(this.entorno.syncCertificationEnabled
            ? [{ restauranteGlobalId: null, sucursalGlobalId: null }]
            : []),
        ],
      },
      select: { nodeId: true, sucursalGlobalId: true },
    });
    const unicos = new Map(peers.map((peer) => [peer.nodeId, peer]));
    for (const peer of unicos.values()) {
      await this.outbox.encolar(
        {
          destinationNodeId: peer.nodeId,
          restauranteGlobalId,
          sucursalGlobalId: peer.sucursalGlobalId,
          aggregateType,
          aggregateGlobalId,
          eventType,
          schemaVersion: 1,
          payload,
        },
        tx,
      );
    }
    return unicos.size;
  }

  private async encolarParaDestinos(
    tx: Prisma.TransactionClient,
    restauranteGlobalId: string,
    sucursalGlobalId: string,
    aggregateType: string,
    aggregateGlobalId: string,
    eventType: string,
    payload: Prisma.InputJsonObject,
  ): Promise<number> {
    const destinos = await this.destinos(
      tx,
      restauranteGlobalId,
      sucursalGlobalId,
    );
    for (const destinationNodeId of destinos) {
      await this.outbox.encolar(
        {
          destinationNodeId,
          restauranteGlobalId,
          sucursalGlobalId,
          aggregateType,
          aggregateGlobalId,
          eventType,
          schemaVersion: 1,
          payload,
        },
        tx,
      );
    }
    return destinos.length;
  }

  private async destinos(
    tx: Prisma.TransactionClient,
    restauranteGlobalId: string,
    sucursalGlobalId: string,
  ): Promise<string[]> {
    if (this.entorno.syncRol === 'EDGE') {
      return this.entorno.syncPeerNodeId ? [this.entorno.syncPeerNodeId] : [];
    }
    if (this.entorno.syncRol !== 'CLOUD') return [];

    const peers = await tx.syncPeer.findMany({
      where: {
        activo: true,
        rol: RolNodoSync.EDGE,
        AND: [
          {
            OR: [
              { sucursalGlobalId },
              { sucursalGlobalId: null, restauranteGlobalId },
              ...(this.entorno.syncCertificationEnabled
                ? [{ sucursalGlobalId: null, restauranteGlobalId: null }]
                : []),
            ],
          },
        ],
      },
      select: { nodeId: true },
    });
    return [...new Set(peers.map((peer) => peer.nodeId))];
  }
}
