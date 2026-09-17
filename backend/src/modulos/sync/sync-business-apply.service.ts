import { Injectable } from '@nestjs/common';
import { AmbitoRol, Prisma, RolNodoSync } from '@prisma/client';
import { EventoSyncWire } from './sync.types';

@Injectable()
export class SyncBusinessApplyService {
  async aplicar(tx: Prisma.TransactionClient, evento: EventoSyncWire) {
    switch (evento.eventType) {
      case 'PEDIDO.SNAPSHOT_V1':
        return this.aplicarPedido(tx, evento);
      case 'COMANDA.SNAPSHOT_V1':
        return this.aplicarComanda(tx, evento);
      case 'DOMICILIO.SNAPSHOT_V1':
        return this.aplicarDomicilio(tx, evento);
      case 'VENTA.SNAPSHOT_V1':
        return this.aplicarVenta(tx, evento);
      case 'CAJA.SNAPSHOT_V1':
        return this.aplicarCaja(tx, evento);
      case 'PAGO.SNAPSHOT_V1':
        return this.aplicarPago(tx, evento);
      case 'MOVIMIENTO_CAJA.SNAPSHOT_V1':
        return this.aplicarMovimientoCaja(tx, evento);
      case 'CLIENTE.SNAPSHOT_V1':
        return this.aplicarCliente(tx, evento);
      case 'NIVEL_FIDELIZACION.SNAPSHOT_V1':
        return this.aplicarNivelFidelizacion(tx, evento);
      case 'CUENTA_FIDELIZACION.SNAPSHOT_V1':
        return this.aplicarCuentaFidelizacion(tx, evento);
      case 'MOVIMIENTO_PUNTOS.SNAPSHOT_V1':
        return this.aplicarMovimientoPuntos(tx, evento);
      case 'CONSENTIMIENTO_CLIENTE.SNAPSHOT_V1':
        return this.aplicarConsentimientoCliente(tx, evento);
      case 'ARTICULO.SNAPSHOT_V1':
        return this.aplicarArticulo(tx, evento);
      case 'MOVIMIENTO_INVENTARIO.SNAPSHOT_V1':
        return this.aplicarMovimientoInventario(tx, evento);
      case 'CATEGORIA.SNAPSHOT_V1':
        return this.aplicarCategoria(tx, evento);
      case 'PRODUCTO.SNAPSHOT_V1':
        return this.aplicarProducto(tx, evento);
      case 'ZONA.SNAPSHOT_V1':
        return this.aplicarZona(tx, evento);
      case 'MESA.SNAPSHOT_V1':
        return this.aplicarMesa(tx, evento);
      case 'ROL_PERMISOS.SNAPSHOT_V1':
        return this.aplicarRolPermisos(tx, evento);
      case 'USUARIO.SNAPSHOT_V1':
        return this.aplicarUsuario(tx, evento);
      case 'CONFIGURACION_RESTAURANTE.SNAPSHOT_V1':
        return this.aplicarConfiguracionRestaurante(tx, evento);
      case 'CONFIGURACION_SUCURSAL.SNAPSHOT_V1':
        return this.aplicarConfiguracionSucursal(tx, evento);
      default:
        return false;
    }
  }

  private async aplicarPedido(
    tx: Prisma.TransactionClient,
    evento: EventoSyncWire,
  ) {
    const p = objeto(evento.payload, 'payload PEDIDO');
    const globalId = uuid(p.globalId, 'pedido.globalId');
    this.validarEnvelope(evento, p, globalId);
    const sucursalGlobalId = uuid(p.sucursalGlobalId, 'pedido.sucursalGlobalId');
    const sucursal = await tx.sucursal.findUnique({
      where: { globalId: sucursalGlobalId },
      include: { restaurante: true },
    });
    if (!sucursal) throw new Error('Sucursal del pedido no existe en destino');
    if (sucursal.restaurante.globalId !== evento.restauranteGlobalId) {
      throw new Error('Pedido intenta cruzar de restaurante');
    }
    const mesaId = await idOpcional(tx.mesa, p.mesaGlobalId, 'mesa');
    const usuarioId = await idOpcional(tx.usuario, p.usuarioGlobalId, 'usuario');
    const meseroId = await idOpcional(tx.usuario, p.meseroGlobalId, 'mesero');

    const existente = await tx.pedido.findUnique({ where: { globalId } });
    const dataBase = {
      sucursalId: sucursal.id,
      mesaId,
      usuarioId,
      meseroId,
      total: decimal(p.total, 'pedido.total'),
      tipo: texto(p.tipo, 'pedido.tipo') as never,
      estado: texto(p.estado, 'pedido.estado') as never,
      personas: enteroNullable(p.personas, 'pedido.personas'),
      observaciones: textoNullable(p.observaciones, 'pedido.observaciones'),
      creadoEn: fecha(p.creadoEn, 'pedido.creadoEn'),
    };
    const pedido = existente
      ? await tx.pedido.update({ where: { id: existente.id }, data: dataBase })
      : await tx.pedido.create({ data: { globalId, ...dataBase } });

    const detalles = arreglo(p.detalles, 'pedido.detalles');
    for (const bruto of detalles) {
      const d = objeto(bruto, 'detallePedido');
      const detalleGlobalId = uuid(d.globalId, 'detallePedido.globalId');
      const productoGlobalId = uuid(
        d.productoGlobalId,
        'detallePedido.productoGlobalId',
      );
      const producto = await tx.producto.findUnique({
        where: { globalId: productoGlobalId },
        include: { categoria: true },
      });
      if (!producto || producto.categoria.sucursalId !== sucursal.id) {
        throw new Error('Producto del detalle no existe en la sucursal destino');
      }
      const detalleExistente = await tx.detallePedido.findUnique({
        where: { globalId: detalleGlobalId },
      });
      if (detalleExistente && detalleExistente.pedidoId !== pedido.id) {
        throw new Error('detallePedido.globalId pertenece a otro pedido');
      }
      const detalleData = {
        pedidoId: pedido.id,
        productoId: producto.id,
        cantidad: entero(d.cantidad, 'detallePedido.cantidad'),
        precioUnitario: decimal(d.precioUnitario, 'detallePedido.precioUnitario'),
        subtotal: decimal(d.subtotal, 'detallePedido.subtotal'),
        observaciones: textoNullable(d.observaciones, 'detallePedido.observaciones'),
      };
      const detalle = detalleExistente
        ? await tx.detallePedido.update({
            where: { id: detalleExistente.id },
            data: detalleData,
          })
        : await tx.detallePedido.create({
            data: { globalId: detalleGlobalId, ...detalleData },
          });

      await tx.detallePedidoModificador.deleteMany({
        where: { detallePedidoId: detalle.id },
      });
      const modificadores = arreglo(d.modificadores ?? [], 'detalle.modificadores');
      if (modificadores.length) {
        await tx.detallePedidoModificador.createMany({
          data: modificadores.map((brutoMod) => {
            const m = objeto(brutoMod, 'modificador');
            return {
              detallePedidoId: detalle.id,
              modificadorId: null,
              nombre: texto(m.nombre, 'modificador.nombre'),
              precioUnitario: decimal(m.precioUnitario, 'modificador.precioUnitario'),
              cantidad: entero(m.cantidad, 'modificador.cantidad'),
              subtotal: decimal(m.subtotal, 'modificador.subtotal'),
            };
          }),
        });
      }
    }
    return true;
  }

  private async aplicarComanda(
    tx: Prisma.TransactionClient,
    evento: EventoSyncWire,
  ) {
    const p = objeto(evento.payload, 'payload COMANDA');
    const globalId = uuid(p.globalId, 'comanda.globalId');
    this.validarEnvelope(evento, p, globalId);
    const pedido = await tx.pedido.findUnique({
      where: { globalId: uuid(p.pedidoGlobalId, 'comanda.pedidoGlobalId') },
      include: { sucursal: { include: { restaurante: true } } },
    });
    if (!pedido) throw new Error('Pedido de la comanda no existe en destino');
    if (
      pedido.sucursal.globalId !== evento.sucursalGlobalId ||
      pedido.sucursal.restaurante.globalId !== evento.restauranteGlobalId
    ) {
      throw new Error('Comanda fuera del alcance del pedido');
    }
    const estacion = await tx.estacionPreparacion.findUnique({
      where: {
        globalId: uuid(p.estacionGlobalId, 'comanda.estacionGlobalId'),
      },
    });
    if (!estacion || estacion.sucursalId !== pedido.sucursalId) {
      throw new Error('Estacion de la comanda no existe en la sucursal destino');
    }
    const vistoPorId = await idOpcional(tx.usuario, p.vistoPorGlobalId, 'vistoPor');
    const ultimaSolicitudImpresionPorId = await idOpcional(
      tx.usuario,
      p.ultimaSolicitudImpresionPorGlobalId,
      'ultimaSolicitudImpresionPor',
    );
    const existente = await tx.comanda.findUnique({ where: { globalId } });
    const dataBase = {
      pedidoId: pedido.id,
      estacionId: estacion.id,
      vistoPorId,
      ultimaSolicitudImpresionPorId,
      estado: texto(p.estado, 'comanda.estado') as never,
      prioridad: texto(p.prioridad, 'comanda.prioridad') as never,
      fechaEnvio: fecha(p.fechaEnvio, 'comanda.fechaEnvio'),
      fechaVista: fechaNullable(p.fechaVista, 'comanda.fechaVista'),
      fechaInicio: fechaNullable(p.fechaInicio, 'comanda.fechaInicio'),
      fechaLista: fechaNullable(p.fechaLista, 'comanda.fechaLista'),
      fechaEntrega: fechaNullable(p.fechaEntrega, 'comanda.fechaEntrega'),
      solicitudesImpresion: entero(
        p.solicitudesImpresion,
        'comanda.solicitudesImpresion',
      ),
      fechaUltimaSolicitudImpresion: fechaNullable(
        p.fechaUltimaSolicitudImpresion,
        'comanda.fechaUltimaSolicitudImpresion',
      ),
      metaPreparacionMin: entero(
        p.metaPreparacionMin,
        'comanda.metaPreparacionMin',
      ),
    };
    const comanda = existente
      ? await tx.comanda.update({ where: { id: existente.id }, data: dataBase })
      : await tx.comanda.create({ data: { globalId, ...dataBase } });

    for (const bruto of arreglo(p.detalles, 'comanda.detalles')) {
      const d = objeto(bruto, 'detalleComanda');
      const detalleGlobalId = uuid(d.globalId, 'detalleComanda.globalId');
      const detallePedido = await tx.detallePedido.findUnique({
        where: {
          globalId: uuid(
            d.detallePedidoGlobalId,
            'detalleComanda.detallePedidoGlobalId',
          ),
        },
      });
      if (!detallePedido || detallePedido.pedidoId !== pedido.id) {
        throw new Error('Detalle de pedido de la comanda no existe en destino');
      }
      const existenteDetalle = await tx.detalleComanda.findUnique({
        where: { globalId: detalleGlobalId },
      });
      if (existenteDetalle && existenteDetalle.comandaId !== comanda.id) {
        throw new Error('detalleComanda.globalId pertenece a otra comanda');
      }
      const detalleData = {
        comandaId: comanda.id,
        detallePedidoId: detallePedido.id,
        cantidad: entero(d.cantidad, 'detalleComanda.cantidad'),
        estado: texto(d.estado, 'detalleComanda.estado') as never,
        fechaInicio: fechaNullable(d.fechaInicio, 'detalleComanda.fechaInicio'),
        fechaLista: fechaNullable(d.fechaLista, 'detalleComanda.fechaLista'),
      };
      if (existenteDetalle) {
        await tx.detalleComanda.update({
          where: { id: existenteDetalle.id },
          data: detalleData,
        });
      } else {
        const porRelacion = await tx.detalleComanda.findUnique({
          where: {
            comandaId_detallePedidoId: {
              comandaId: comanda.id,
              detallePedidoId: detallePedido.id,
            },
          },
        });
        if (porRelacion && porRelacion.globalId !== detalleGlobalId) {
          throw new Error('Relacion comanda/detalle ya existe con otro globalId');
        }
        if (!porRelacion) {
          await tx.detalleComanda.create({
            data: { globalId: detalleGlobalId, ...detalleData },
          });
        }
      }
    }
    return true;
  }

  private async aplicarDomicilio(
    tx: Prisma.TransactionClient,
    evento: EventoSyncWire,
  ) {
    const p = objeto(evento.payload, 'payload DOMICILIO');
    const globalId = uuid(p.globalId, 'domicilio.globalId');
    this.validarEnvelope(evento, p, globalId, false);
    const pedido = await tx.pedido.findUnique({
      where: { globalId: uuid(p.pedidoGlobalId, 'domicilio.pedidoGlobalId') },
      include: { sucursal: { include: { restaurante: true } } },
    });
    if (!pedido) throw new Error('Pedido del domicilio no existe en destino');
    if (
      pedido.sucursal.globalId !== evento.sucursalGlobalId ||
      pedido.sucursal.restaurante.globalId !== evento.restauranteGlobalId
    ) {
      throw new Error('Domicilio fuera del alcance del pedido');
    }
    const repartidorId = await idOpcional(
      tx.usuario,
      p.repartidorGlobalId,
      'repartidor',
    );
    const existente = await tx.domicilio.findUnique({ where: { globalId } });
    const porPedido = await tx.domicilio.findUnique({
      where: { pedidoId: pedido.id },
    });
    if (porPedido && porPedido.globalId !== globalId) {
      throw new Error('Pedido ya tiene otro domicilio globalId');
    }
    const dataBase = {
      pedidoId: pedido.id,
      repartidorId,
      estado: texto(p.estado, 'domicilio.estado') as never,
      destinatario: texto(p.destinatario, 'domicilio.destinatario'),
      telefono: texto(p.telefono, 'domicilio.telefono'),
      direccion: texto(p.direccion, 'domicilio.direccion'),
      referencias: textoNullable(p.referencias, 'domicilio.referencias'),
      costo: decimal(p.costo, 'domicilio.costo'),
      asignadoEn: fechaNullable(p.asignadoEn, 'domicilio.asignadoEn'),
      enRutaEn: fechaNullable(p.enRutaEn, 'domicilio.enRutaEn'),
      entregadoEn: fechaNullable(p.entregadoEn, 'domicilio.entregadoEn'),
      observacion: textoNullable(p.observacion, 'domicilio.observacion'),
      creadoEn: fecha(p.creadoEn, 'domicilio.creadoEn'),
      actualizadoEn: fecha(p.actualizadoEn, 'domicilio.actualizadoEn'),
    };
    if (existente) {
      await tx.domicilio.update({ where: { id: existente.id }, data: dataBase });
    } else if (!porPedido) {
      await tx.domicilio.create({ data: { globalId, ...dataBase } });
    }
    return true;
  }


  private async aplicarVenta(tx: Prisma.TransactionClient, evento: EventoSyncWire) {
    const p = objeto(evento.payload, 'payload VENTA');
    const globalId = uuid(p.globalId, 'venta.globalId');
    this.validarEnvelope(evento, p, globalId);
    const sucursal = await tx.sucursal.findUnique({ where: { globalId: uuid(p.sucursalGlobalId, 'venta.sucursalGlobalId') }, include: { restaurante: true } });
    if (!sucursal || sucursal.restaurante.globalId !== evento.restauranteGlobalId) throw new Error('Sucursal de venta invalida en destino');
    const usuarioId = await idRequerido(tx.usuario, p.usuarioGlobalId, 'usuario');
    const pedidoId = await idOpcional(tx.pedido, p.pedidoGlobalId, 'pedido');
    const clienteId = await idOpcional(tx.cliente, p.clienteGlobalId, 'cliente');
    const base = {
      origen: texto(p.origen, 'venta.origen') as never,
      estado: texto(p.estado, 'venta.estado') as never,
      subtotal: decimal(p.subtotal, 'venta.subtotal'), descuentos: decimal(p.descuentos, 'venta.descuentos'),
      impuestos: decimal(p.impuestos, 'venta.impuestos'), impoconsumo: decimal(p.impoconsumo, 'venta.impoconsumo'),
      propina: decimal(p.propina, 'venta.propina'), domicilioCosto: decimal(p.domicilioCosto, 'venta.domicilioCosto'), total: decimal(p.total, 'venta.total'),
      fechaOperacion: fecha(p.fechaOperacion, 'venta.fechaOperacion'), numeroComandaPapel: textoNullable(p.numeroComandaPapel, 'venta.numeroComandaPapel'),
      numeroSoporte: textoNullable(p.numeroSoporte, 'venta.numeroSoporte'), soporteArchivoRef: textoNullable(p.soporteArchivoRef, 'venta.soporteArchivoRef'),
      idempotenciaClave: textoNullable(p.idempotenciaClave, 'venta.idempotenciaClave'), idempotenciaHash: textoNullable(p.idempotenciaHash, 'venta.idempotenciaHash'),
      sucursalId: sucursal.id, usuarioId, pedidoId, clienteId,
    };
    const existente = await tx.venta.findUnique({ where: { globalId } });
    const venta = existente ? await tx.venta.update({ where: { id: existente.id }, data: base }) : await tx.venta.create({ data: { globalId, ...base } });
    for (const bruto of arreglo(p.detalles, 'venta.detalles')) {
      const d = objeto(bruto, 'venta.detalle'); const detalleGlobalId = uuid(d.globalId, 'detalleVenta.globalId');
      const productoId = await idRequerido(tx.producto, d.productoGlobalId, 'producto');
      const data = { ventaId: venta.id, productoId, cantidad: entero(d.cantidad, 'detalleVenta.cantidad'), precioUnitario: decimal(d.precioUnitario, 'detalleVenta.precioUnitario'), subtotal: decimal(d.subtotal, 'detalleVenta.subtotal') };
      const old = await tx.detalleVenta.findUnique({ where: { globalId: detalleGlobalId } });
      if (old) await tx.detalleVenta.update({ where: { id: old.id }, data }); else await tx.detalleVenta.create({ data: { globalId: detalleGlobalId, ...data } });
    }
    return true;
  }

  private async aplicarCaja(tx: Prisma.TransactionClient, evento: EventoSyncWire) {
    const p = objeto(evento.payload, 'payload CAJA'); const globalId = uuid(p.globalId, 'caja.globalId'); this.validarEnvelope(evento, p, globalId);
    const sucursal = await tx.sucursal.findUnique({ where: { globalId: uuid(p.sucursalGlobalId, 'caja.sucursalGlobalId') }, include: { restaurante: true } });
    if (!sucursal || sucursal.restaurante.globalId !== evento.restauranteGlobalId) throw new Error('Sucursal de caja invalida');
    const abiertaPorId = await idRequerido(tx.usuario, p.abiertaPorGlobalId, 'abiertaPor'); const cerradaPorId = await idOpcional(tx.usuario, p.cerradaPorGlobalId, 'cerradaPor');
    const nullableDecimal=(v:unknown,n:string)=>v==null?null:decimal(v,n);
    const data = { nombre: texto(p.nombre,'caja.nombre'), estado: texto(p.estado,'caja.estado') as never, saldoInicial: decimal(p.saldoInicial,'caja.saldoInicial'),
      saldoEsperado: nullableDecimal(p.saldoEsperado,'caja.saldoEsperado'), saldoContado: nullableDecimal(p.saldoContado,'caja.saldoContado'), diferencia: nullableDecimal(p.diferencia,'caja.diferencia'),
      totalEfectivoSistema: nullableDecimal(p.totalEfectivoSistema,'caja.totalEfectivoSistema'), totalOtrosPagos: nullableDecimal(p.totalOtrosPagos,'caja.totalOtrosPagos'), totalIngresos: nullableDecimal(p.totalIngresos,'caja.totalIngresos'), totalEgresos: nullableDecimal(p.totalEgresos,'caja.totalEgresos'),
      fechaApertura: fecha(p.fechaApertura,'caja.fechaApertura'), fechaCierre: fechaNullable(p.fechaCierre,'caja.fechaCierre'), observacionApertura: textoNullable(p.observacionApertura,'caja.observacionApertura'), observacionCierre: textoNullable(p.observacionCierre,'caja.observacionCierre'),
      aperturaClave: textoNullable(p.aperturaClave,'caja.aperturaClave'), aperturaHash: textoNullable(p.aperturaHash,'caja.aperturaHash'), cierreClave: textoNullable(p.cierreClave,'caja.cierreClave'), cierreHash: textoNullable(p.cierreHash,'caja.cierreHash'),
      sucursalId: sucursal.id, abiertaPorId, cerradaPorId };
    const old=await tx.caja.findUnique({where:{globalId}}); if(old) await tx.caja.update({where:{id:old.id},data}); else await tx.caja.create({data:{globalId,...data}}); return true;
  }

  private async aplicarPago(tx: Prisma.TransactionClient, evento: EventoSyncWire) {
    const p=objeto(evento.payload,'payload PAGO'); const globalId=uuid(p.globalId,'pago.globalId'); this.validarEnvelope(evento,p,globalId);
    const venta = await tx.venta.findUnique({ where: { globalId: uuid(p.ventaGlobalId, 'venta.globalId') }, include: { sucursal: { include: { restaurante: true } } } });
    if (!venta || venta.sucursal.globalId !== evento.sucursalGlobalId || venta.sucursal.restaurante.globalId !== evento.restauranteGlobalId) throw new Error('Pago intenta cruzar de sucursal/restaurante');
    const ventaId=venta.id; const metodoPagoId=await idRequerido(tx.metodoPago,p.metodoPagoGlobalId,'metodoPago'); const cajaId=await idOpcional(tx.caja,p.cajaGlobalId,'caja'); const usuarioId=await idOpcional(tx.usuario,p.usuarioGlobalId,'usuario');
    if (cajaId !== null) { const caja = await tx.caja.findUnique({ where: { id: cajaId } }); if (!caja || caja.sucursalId !== venta.sucursalId) throw new Error('Caja del pago pertenece a otra sucursal'); }
    if (usuarioId !== null) { const usuario = await tx.usuario.findUnique({ where: { id: usuarioId } }); if (!usuario || usuario.restauranteId !== venta.sucursal.restauranteId) throw new Error('Usuario del pago pertenece a otro restaurante'); }
    const data={ventaId,metodoPagoId,cajaId,usuarioId,monto:decimal(p.monto,'pago.monto'),referencia:textoNullable(p.referencia,'pago.referencia'),creadoEn:fecha(p.creadoEn,'pago.creadoEn'),idempotenciaClave:textoNullable(p.idempotenciaClave,'pago.idempotenciaClave'),idempotenciaHash:textoNullable(p.idempotenciaHash,'pago.idempotenciaHash')};
    const old=await tx.pago.findUnique({where:{globalId}}); if(old) await tx.pago.update({where:{id:old.id},data}); else await tx.pago.create({data:{globalId,...data}}); return true;
  }

  private async aplicarMovimientoCaja(tx: Prisma.TransactionClient, evento: EventoSyncWire) {
    const p=objeto(evento.payload,'payload MOVIMIENTO_CAJA'); const globalId=uuid(p.globalId,'movimientoCaja.globalId'); this.validarEnvelope(evento,p,globalId);
    const caja = await tx.caja.findUnique({ where: { globalId: uuid(p.cajaGlobalId, 'caja.globalId') }, include: { sucursal: { include: { restaurante: true } } } });
    if (!caja || caja.sucursal.globalId !== evento.sucursalGlobalId || caja.sucursal.restaurante.globalId !== evento.restauranteGlobalId) throw new Error('MovimientoCaja intenta cruzar de sucursal/restaurante');
    const cajaId=caja.id; const usuarioId=await idRequerido(tx.usuario,p.usuarioGlobalId,'usuario');
    const usuario = await tx.usuario.findUnique({ where: { id: usuarioId } }); if (!usuario || usuario.restauranteId !== caja.sucursal.restauranteId) throw new Error('Usuario del movimiento pertenece a otro restaurante');
    const data={cajaId,usuarioId,tipo:texto(p.tipo,'movimientoCaja.tipo') as never,monto:decimal(p.monto,'movimientoCaja.monto'),concepto:texto(p.concepto,'movimientoCaja.concepto'),observacion:textoNullable(p.observacion,'movimientoCaja.observacion'),creadoEn:fecha(p.creadoEn,'movimientoCaja.creadoEn'),idempotenciaClave:textoNullable(p.idempotenciaClave,'movimientoCaja.idempotenciaClave'),idempotenciaHash:textoNullable(p.idempotenciaHash,'movimientoCaja.idempotenciaHash')};
    const old=await tx.movimientoCaja.findUnique({where:{globalId}}); if(old) await tx.movimientoCaja.update({where:{id:old.id},data}); else await tx.movimientoCaja.create({data:{globalId,...data}}); return true;
  }



  private async aplicarCliente(tx: Prisma.TransactionClient, evento: EventoSyncWire) {
    const p = objeto(evento.payload, 'payload CLIENTE');
    const globalId = uuid(p.globalId, 'cliente.globalId');
    this.validarEnvelope(evento, p, globalId, false);
    const restaurante = await tx.restaurante.findUnique({ where: { globalId: evento.restauranteGlobalId } });
    if (!restaurante) throw new Error('Restaurante del cliente no existe en destino');
    const data = {
      restauranteId: restaurante.id,
      tipoDocumento: textoNullable(p.tipoDocumento, 'cliente.tipoDocumento'),
      numeroDocumento: textoNullable(p.numeroDocumento, 'cliente.numeroDocumento'),
      nombres: texto(p.nombres, 'cliente.nombres'),
      apellidos: textoNullable(p.apellidos, 'cliente.apellidos'),
      telefono: textoNullable(p.telefono, 'cliente.telefono'),
      correo: textoNullable(p.correo, 'cliente.correo'),
      direccion: textoNullable(p.direccion, 'cliente.direccion'),
      fechaNacimiento: fechaNullable(p.fechaNacimiento, 'cliente.fechaNacimiento'),
      estado: booleano(p.estado, 'cliente.estado'),
      creadoEn: fecha(p.creadoEn, 'cliente.creadoEn'),
    };
    const existente = await tx.cliente.findUnique({ where: { globalId } });
    if (existente && existente.restauranteId !== restaurante.id) throw new Error('Cliente intenta cruzar de restaurante');
    if (p.numeroDocumento) {
      const colision = await tx.cliente.findFirst({ where: { restauranteId: restaurante.id, numeroDocumento: String(p.numeroDocumento), NOT: { globalId } } });
      if (colision) throw new Error('CONFLICT_CLIENTE_DOCUMENTO');
    }
    existente
      ? await tx.cliente.update({ where: { id: existente.id }, data })
      : await tx.cliente.create({ data: { globalId, ...data } });
    return true;
  }

  private async aplicarNivelFidelizacion(tx: Prisma.TransactionClient, evento: EventoSyncWire) {
    const p = objeto(evento.payload, 'payload NIVEL_FIDELIZACION');
    const globalId = uuid(p.globalId, 'nivel.globalId');
    this.validarEnvelope(evento, p, globalId, false);
    const restaurante = await tx.restaurante.findUnique({ where: { globalId: evento.restauranteGlobalId } });
    if (!restaurante) throw new Error('Restaurante del nivel no existe en destino');
    const data = {
      restauranteId: restaurante.id,
      nombre: texto(p.nombre, 'nivel.nombre'),
      puntosMinimos: entero(p.puntosMinimos, 'nivel.puntosMinimos'),
      multiplicador: decimal(p.multiplicador, 'nivel.multiplicador'),
      beneficios: p.beneficios === null || p.beneficios === undefined ? Prisma.JsonNull : (p.beneficios as Prisma.InputJsonValue),
      activo: booleano(p.activo, 'nivel.activo'),
      creadoEn: fecha(p.creadoEn, 'nivel.creadoEn'),
    };
    const existente = await tx.nivelFidelizacion.findUnique({ where: { globalId } });
    if (existente && existente.restauranteId !== restaurante.id) throw new Error('Nivel fidelizacion intenta cruzar de restaurante');
    existente
      ? await tx.nivelFidelizacion.update({ where: { id: existente.id }, data })
      : await tx.nivelFidelizacion.create({ data: { globalId, ...data } });
    return true;
  }

  private async aplicarCuentaFidelizacion(tx: Prisma.TransactionClient, evento: EventoSyncWire) {
    const p = objeto(evento.payload, 'payload CUENTA_FIDELIZACION');
    const globalId = uuid(p.globalId, 'cuenta.globalId');
    this.validarEnvelope(evento, p, globalId, false);
    const clienteGlobalId = uuid(p.clienteGlobalId, 'cuenta.clienteGlobalId');
    const cliente = await tx.cliente.findUnique({ where: { globalId: clienteGlobalId }, include: { restaurante: true } });
    if (!cliente || cliente.restaurante.globalId !== evento.restauranteGlobalId) throw new Error('Cliente de cuenta no existe o cruza restaurante');
    const nivelId = await idOpcional(tx.nivelFidelizacion, p.nivelGlobalId, 'nivelFidelizacion');
    const data = {
      clienteId: cliente.id,
      nivelId,
      saldoPuntos: entero(p.saldoPuntos, 'cuenta.saldoPuntos'),
      puntosHistoricos: entero(p.puntosHistoricos, 'cuenta.puntosHistoricos'),
    };
    const existente = await tx.cuentaFidelizacion.findUnique({ where: { globalId } });
    const porCliente = await tx.cuentaFidelizacion.findUnique({ where: { clienteId: cliente.id } });
    if (porCliente && porCliente.globalId !== globalId) throw new Error('CONFLICT_CUENTA_FIDELIZACION');
    existente
      ? await tx.cuentaFidelizacion.update({ where: { id: existente.id }, data })
      : await tx.cuentaFidelizacion.create({ data: { globalId, ...data } });
    return true;
  }

  private async aplicarMovimientoPuntos(tx: Prisma.TransactionClient, evento: EventoSyncWire) {
    const p = objeto(evento.payload, 'payload MOVIMIENTO_PUNTOS');
    const globalId = uuid(p.globalId, 'movimientoPuntos.globalId');
    this.validarEnvelope(evento, p, globalId, false);
    const cuentaId = await idRequerido(tx.cuentaFidelizacion, p.cuentaGlobalId, 'cuentaFidelizacion');
    const cuenta = await tx.cuentaFidelizacion.findUnique({ where: { id: cuentaId }, include: { cliente: { include: { restaurante: true } } } });
    if (!cuenta || cuenta.cliente.restaurante.globalId !== evento.restauranteGlobalId) throw new Error('Movimiento puntos cruza restaurante');
    const existente = await tx.movimientoPuntos.findUnique({ where: { globalId } });
    if (existente) return true;
    const ventaId = await idOpcional(tx.venta, p.ventaGlobalId, 'venta');
    const usuarioId = await idOpcional(tx.usuario, p.usuarioGlobalId, 'usuario');
    const saldoPosterior = entero(p.saldoPosterior, 'movimientoPuntos.saldoPosterior');
    await tx.movimientoPuntos.create({
      data: {
        globalId,
        cuentaId,
        ventaId,
        usuarioId,
        tipo: texto(p.tipo, 'movimientoPuntos.tipo') as never,
        puntos: entero(p.puntos, 'movimientoPuntos.puntos'),
        saldoPosterior,
        motivo: texto(p.motivo, 'movimientoPuntos.motivo'),
        creadoEn: fecha(p.creadoEn, 'movimientoPuntos.creadoEn'),
      },
    });
    // La cuenta converge al saldo certificado por el movimiento. Nunca sumamos
    // de nuevo al recibir el mismo eventId/globalId.
    await tx.cuentaFidelizacion.update({ where: { id: cuentaId }, data: { saldoPuntos: saldoPosterior } });
    return true;
  }

  private async aplicarConsentimientoCliente(tx: Prisma.TransactionClient, evento: EventoSyncWire) {
    const p = objeto(evento.payload, 'payload CONSENTIMIENTO_CLIENTE');
    const globalId = uuid(p.globalId, 'consentimiento.globalId');
    this.validarEnvelope(evento, p, globalId, false);
    const clienteId = await idRequerido(tx.cliente, p.clienteGlobalId, 'cliente');
    const usuarioId = await idRequerido(tx.usuario, p.usuarioGlobalId, 'usuario');
    const canal = texto(p.canal, 'consentimiento.canal') as never;
    const cliente = await tx.cliente.findUnique({ where: { id: clienteId }, include: { restaurante: true } });
    if (!cliente || cliente.restaurante.globalId !== evento.restauranteGlobalId) throw new Error('Consentimiento cruza restaurante');
    const existente = await tx.consentimientoCliente.findUnique({ where: { globalId } });
    const porCanal = await tx.consentimientoCliente.findUnique({ where: { clienteId_canal: { clienteId, canal } } });
    if (porCanal && porCanal.globalId !== globalId) {
      // Clave natural cliente+canal: preservamos el globalId existente del destino
      // y actualizamos el estado, evitando duplicados.
      await tx.consentimientoCliente.update({
        where: { id: porCanal.id },
        data: {
          usuarioId,
          otorgado: booleano(p.otorgado, 'consentimiento.otorgado'),
          fuente: texto(p.fuente, 'consentimiento.fuente'),
          registradoEn: fecha(p.registradoEn, 'consentimiento.registradoEn'),
          revocadoEn: fechaNullable(p.revocadoEn, 'consentimiento.revocadoEn'),
        },
      });
      return true;
    }
    const data = {
      clienteId,
      usuarioId,
      canal,
      otorgado: booleano(p.otorgado, 'consentimiento.otorgado'),
      fuente: texto(p.fuente, 'consentimiento.fuente'),
      registradoEn: fecha(p.registradoEn, 'consentimiento.registradoEn'),
      revocadoEn: fechaNullable(p.revocadoEn, 'consentimiento.revocadoEn'),
    };
    existente
      ? await tx.consentimientoCliente.update({ where: { id: existente.id }, data })
      : await tx.consentimientoCliente.create({ data: { globalId, ...data } });
    return true;
  }

  private async aplicarArticulo(
    tx: Prisma.TransactionClient,
    evento: EventoSyncWire,
  ) {
    const p = objeto(evento.payload, 'payload ARTICULO');
    const globalId = uuid(p.globalId, 'articulo.globalId');
    this.validarEnvelope(evento, p, globalId);
    const sucursal = await tx.sucursal.findUnique({
      where: { globalId: uuid(p.sucursalGlobalId, 'articulo.sucursalGlobalId') },
      include: { restaurante: true },
    });
    if (
      !sucursal ||
      sucursal.globalId !== evento.sucursalGlobalId ||
      sucursal.restaurante.globalId !== evento.restauranteGlobalId
    ) {
      throw new Error('Articulo intenta cruzar de sucursal/restaurante');
    }

    const data = {
      nombre: texto(p.nombre, 'articulo.nombre'),
      unidad: texto(p.unidad, 'articulo.unidad') as never,
      costoUnidad: decimal(p.costoUnidad, 'articulo.costoUnidad'),
      stockMinimo: decimal(p.stockMinimo, 'articulo.stockMinimo'),
      diasAnticipacion: entero(p.diasAnticipacion, 'articulo.diasAnticipacion'),
      estado: booleano(p.estado, 'articulo.estado'),
      creadoEn: fecha(p.creadoEn, 'articulo.creadoEn'),
      sucursalId: sucursal.id,
    };
    const existente = await tx.articulo.findUnique({ where: { globalId } });
    if (existente) {
      if (existente.sucursalId !== sucursal.id) {
        throw new Error('articulo.globalId pertenece a otra sucursal');
      }
      await tx.articulo.update({ where: { id: existente.id }, data });
    } else {
      await tx.articulo.create({
        data: {
          globalId,
          ...data,
          // El stock se reconstruye por la secuencia de movimientos.
          stock: new Prisma.Decimal(0),
        },
      });
    }
    return true;
  }

  private async aplicarMovimientoInventario(
    tx: Prisma.TransactionClient,
    evento: EventoSyncWire,
  ) {
    const p = objeto(evento.payload, 'payload MOVIMIENTO_INVENTARIO');
    const globalId = uuid(p.globalId, 'movimientoInventario.globalId');
    this.validarEnvelope(evento, p, globalId);

    const sucursal = await tx.sucursal.findUnique({
      where: {
        globalId: uuid(
          p.sucursalGlobalId,
          'movimientoInventario.sucursalGlobalId',
        ),
      },
      include: { restaurante: true },
    });
    if (
      !sucursal ||
      sucursal.globalId !== evento.sucursalGlobalId ||
      sucursal.restaurante.globalId !== evento.restauranteGlobalId
    ) {
      throw new Error('MovimientoInventario intenta cruzar de sucursal/restaurante');
    }

    const existente = await tx.movimientoInventario.findUnique({
      where: { globalId },
    });
    if (existente) return true;

    const usuarioId = await idRequerido(
      tx.usuario,
      p.usuarioGlobalId,
      'usuario',
    );
    const ventaId = await idOpcional(tx.venta, p.ventaGlobalId, 'venta');
    const productoId = await idOpcional(
      tx.producto,
      p.productoGlobalId,
      'producto',
    );
    const articuloId = await idOpcional(
      tx.articulo,
      p.articuloGlobalId,
      'articulo',
    );
    const movimientoOrigenId = await idOpcional(
      tx.movimientoInventario,
      p.movimientoOrigenGlobalId,
      'movimientoOrigen',
    );

    if ((productoId === null) === (articuloId === null)) {
      throw new Error(
        'MovimientoInventario debe referenciar exactamente un producto o articulo',
      );
    }

    if (ventaId !== null) {
      const venta = await tx.venta.findUnique({ where: { id: ventaId } });
      if (!venta || venta.sucursalId !== sucursal.id) {
        throw new Error('Venta del movimiento pertenece a otra sucursal');
      }
    }

    const stockAnterior = decimal(
      p.stockAnterior,
      'movimientoInventario.stockAnterior',
    );
    const stockNuevo = decimal(p.stockNuevo, 'movimientoInventario.stockNuevo');

    // Aplicacion secuencial optimista. Nunca hacemos "stock = stockNuevo" a
    // ciegas: un evento viejo no puede pisar un stock mas reciente. Si el stock
    // ya coincide con stockNuevo, el efecto ya estaba aplicado; si coincide con
    // stockAnterior, aplicamos el salto exacto. Cualquier otro valor es conflicto
    // real y queda para reconciliacion, sin corromper inventario.
    if (productoId !== null) {
      const producto = await tx.producto.findUnique({
        where: { id: productoId },
        include: { categoria: true },
      });
      if (!producto || producto.categoria.sucursalId !== sucursal.id) {
        throw new Error('Producto del movimiento pertenece a otra sucursal');
      }
      if (!producto.stock.eq(stockNuevo)) {
        if (!producto.stock.eq(stockAnterior)) {
          throw new Error(
            `CONFLICT_STOCK producto=${producto.globalId} actual=${producto.stock.toString()} esperadoAnterior=${stockAnterior.toString()} esperadoNuevo=${stockNuevo.toString()}`,
          );
        }
        const cambiado = await tx.producto.updateMany({
          where: { id: producto.id, stock: stockAnterior },
          data: { stock: stockNuevo },
        });
        if (cambiado.count !== 1) {
          throw new Error('CONFLICT_STOCK producto cambio concurrentemente');
        }
      }
    } else {
      const articulo = await tx.articulo.findUnique({
        where: { id: articuloId! },
      });
      if (!articulo || articulo.sucursalId !== sucursal.id) {
        throw new Error('Articulo del movimiento pertenece a otra sucursal');
      }
      if (!articulo.stock.eq(stockNuevo)) {
        if (!articulo.stock.eq(stockAnterior)) {
          throw new Error(
            `CONFLICT_STOCK articulo=${articulo.globalId} actual=${articulo.stock.toString()} esperadoAnterior=${stockAnterior.toString()} esperadoNuevo=${stockNuevo.toString()}`,
          );
        }
        const cambiado = await tx.articulo.updateMany({
          where: { id: articulo.id, stock: stockAnterior },
          data: { stock: stockNuevo },
        });
        if (cambiado.count !== 1) {
          throw new Error('CONFLICT_STOCK articulo cambio concurrentemente');
        }
      }
    }

    await tx.movimientoInventario.create({
      data: {
        globalId,
        tipo: texto(p.tipo, 'movimientoInventario.tipo') as never,
        cantidad: decimal(p.cantidad, 'movimientoInventario.cantidad'),
        unidad: texto(p.unidad, 'movimientoInventario.unidad') as never,
        stockAnterior,
        stockNuevo,
        motivo: textoNullable(p.motivo, 'movimientoInventario.motivo'),
        creadoEn: fecha(p.creadoEn, 'movimientoInventario.creadoEn'),
        sucursalId: sucursal.id,
        usuarioId,
        ventaId,
        productoId,
        articuloId,
        movimientoOrigenId,
      },
    });
    return true;
  }



  private async aplicarConfiguracionRestaurante(
    tx: Prisma.TransactionClient,
    evento: EventoSyncWire,
  ) {
    const p = objeto(evento.payload, 'payload CONFIGURACION_RESTAURANTE');
    const restauranteGlobalId = uuid(
      p.restauranteGlobalId,
      'configuracionRestaurante.restauranteGlobalId',
    );
    if (restauranteGlobalId !== evento.restauranteGlobalId) {
      throw new Error('Configuracion de restaurante intenta cruzar de tenant');
    }
    const restaurante = await tx.restaurante.findUnique({
      where: { globalId: restauranteGlobalId },
    });
    if (!restaurante) throw new Error('Restaurante de configuracion no existe en destino');
    const peer = await tx.syncPeer.findUnique({ where: { nodeId: evento.sourceNodeId } });
    if (peer?.rol === RolNodoSync.EDGE) {
      throw new Error('Configuracion de restaurante es autoritativa en CLOUD');
    }
    const clave = texto(p.clave, 'configuracionRestaurante.clave').toUpperCase();
    const valor = valorJson(p.valor, 'configuracionRestaurante.valor');
    await tx.configuracionRestaurante.upsert({
      where: { restauranteId_clave: { restauranteId: restaurante.id, clave } },
      update: { valor },
      create: { restauranteId: restaurante.id, clave, valor },
    });
    return true;
  }

  private async aplicarConfiguracionSucursal(
    tx: Prisma.TransactionClient,
    evento: EventoSyncWire,
  ) {
    const p = objeto(evento.payload, 'payload CONFIGURACION_SUCURSAL');
    const sucursalGlobalId = uuid(
      p.sucursalGlobalId,
      'configuracionSucursal.sucursalGlobalId',
    );
    if (evento.sucursalGlobalId && evento.sucursalGlobalId !== sucursalGlobalId) {
      throw new Error('Configuracion de sucursal no coincide con el envelope');
    }
    const sucursal = await tx.sucursal.findUnique({
      where: { globalId: sucursalGlobalId },
      include: { restaurante: true },
    });
    if (!sucursal) throw new Error('Sucursal de configuracion no existe en destino');
    if (sucursal.restaurante.globalId !== evento.restauranteGlobalId) {
      throw new Error('Configuracion de sucursal intenta cruzar de restaurante');
    }
    const clave = texto(p.clave, 'configuracionSucursal.clave').toUpperCase();
    const valor = valorJson(p.valor, 'configuracionSucursal.valor');
    await tx.configuracionSucursal.upsert({
      where: { sucursalId_clave: { sucursalId: sucursal.id, clave } },
      update: { valor },
      create: { sucursalId: sucursal.id, clave, valor },
    });
    return true;
  }

  private async aplicarCategoria(
    tx: Prisma.TransactionClient,
    evento: EventoSyncWire,
  ) {
    const p = objeto(evento.payload, 'payload CATEGORIA');
    const globalId = uuid(p.globalId, 'categoria.globalId');
    this.validarEnvelope(evento, p, globalId);
    const sucursal = await tx.sucursal.findUnique({
      where: { globalId: uuid(p.sucursalGlobalId, 'categoria.sucursalGlobalId') },
      include: { restaurante: true },
    });
    if (!sucursal) throw new Error('Sucursal de categoria no existe en destino');
    if (sucursal.restaurante.globalId !== evento.restauranteGlobalId) {
      throw new Error('Categoria intenta cruzar de restaurante');
    }
    const data = {
      nombre: texto(p.nombre, 'categoria.nombre'),
      estado: booleano(p.estado, 'categoria.estado'),
      creadoEn: fecha(p.creadoEn, 'categoria.creadoEn'),
      sucursalId: sucursal.id,
    };
    const existente = await tx.categoria.findUnique({ where: { globalId } });
    if (existente && existente.sucursalId !== sucursal.id) {
      throw new Error('categoria.globalId pertenece a otra sucursal');
    }
    if (existente) {
      await tx.categoria.update({ where: { id: existente.id }, data });
    } else {
      await tx.categoria.create({ data: { globalId, ...data } });
    }
    return true;
  }

  private async aplicarProducto(
    tx: Prisma.TransactionClient,
    evento: EventoSyncWire,
  ) {
    const p = objeto(evento.payload, 'payload PRODUCTO');
    const globalId = uuid(p.globalId, 'producto.globalId');
    this.validarEnvelope(evento, p, globalId);
    const categoria = await tx.categoria.findUnique({
      where: { globalId: uuid(p.categoriaGlobalId, 'producto.categoriaGlobalId') },
      include: { sucursal: { include: { restaurante: true } } },
    });
    if (!categoria) throw new Error('Categoria del producto no existe en destino');
    if (
      categoria.sucursal.globalId !== evento.sucursalGlobalId ||
      categoria.sucursal.restaurante.globalId !== evento.restauranteGlobalId
    ) {
      throw new Error('Producto fuera del alcance de categoria');
    }
    const estacionId = await idOpcional(tx.estacionPreparacion, p.estacionGlobalId, 'estacion');
    if (estacionId !== null) {
      const estacion = await tx.estacionPreparacion.findUnique({ where: { id: estacionId } });
      if (!estacion || estacion.sucursalId !== categoria.sucursalId) {
        throw new Error('Estacion del producto pertenece a otra sucursal');
      }
    }
    const data = {
      codigo: textoNullable(p.codigo, 'producto.codigo'),
      nombre: texto(p.nombre, 'producto.nombre'),
      descripcion: textoNullable(p.descripcion, 'producto.descripcion'),
      precio: decimal(p.precio, 'producto.precio'),
      favorito: booleano(p.favorito, 'producto.favorito'),
      disponible: booleano(p.disponible, 'producto.disponible'),
      estrategiaInventario: texto(p.estrategiaInventario, 'producto.estrategiaInventario') as never,
      unidadInventario: texto(p.unidadInventario, 'producto.unidadInventario') as never,
      rendimientoPorcentaje: decimal(p.rendimientoPorcentaje, 'producto.rendimientoPorcentaje'),
      estado: booleano(p.estado, 'producto.estado'),
      creadoEn: fecha(p.creadoEn, 'producto.creadoEn'),
      categoriaId: categoria.id,
      estacionId,
    };
    const existente = await tx.producto.findUnique({ where: { globalId } });
    if (existente && existente.categoriaId !== categoria.id) {
      const categoriaExistente = await tx.categoria.findUnique({ where: { id: existente.categoriaId } });
      if (categoriaExistente?.sucursalId !== categoria.sucursalId) {
        throw new Error('producto.globalId pertenece a otra sucursal');
      }
    }
    const producto = existente
      ? await tx.producto.update({ where: { id: existente.id }, data })
      : await tx.producto.create({ data: { globalId, ...data } });

    const modificadores = arreglo(p.modificadores ?? [], 'producto.modificadores');
    const deseados: string[] = [];
    for (const bruto of modificadores) {
      const m = objeto(bruto, 'producto.modificador');
      const nombre = texto(m.nombre, 'modificador.nombre').trim();
      deseados.push(nombre);
      const actual = await tx.productoModificador.findUnique({
        where: { productoId_nombre: { productoId: producto.id, nombre } },
      });
      const dataMod = {
        precio: decimal(m.precio, 'modificador.precio'),
        activo: booleano(m.activo, 'modificador.activo'),
        orden: entero(m.orden, 'modificador.orden'),
      };
      if (actual) {
        await tx.productoModificador.update({ where: { id: actual.id }, data: dataMod });
      } else {
        await tx.productoModificador.create({ data: { productoId: producto.id, nombre, ...dataMod } });
      }
    }
    await tx.productoModificador.updateMany({
      where: { productoId: producto.id, ...(deseados.length ? { nombre: { notIn: deseados } } : {}) },
      data: { activo: false },
    });
    return true;
  }

  private async aplicarZona(
    tx: Prisma.TransactionClient,
    evento: EventoSyncWire,
  ) {
    const p = objeto(evento.payload, 'payload ZONA');
    const globalId = uuid(p.globalId, 'zona.globalId');
    this.validarEnvelope(evento, p, globalId);
    const sucursal = await tx.sucursal.findUnique({
      where: { globalId: uuid(p.sucursalGlobalId, 'zona.sucursalGlobalId') },
      include: { restaurante: true },
    });
    if (!sucursal) throw new Error('Sucursal de zona no existe en destino');
    if (sucursal.restaurante.globalId !== evento.restauranteGlobalId) {
      throw new Error('Zona intenta cruzar de restaurante');
    }
    const data = {
      nombre: texto(p.nombre, 'zona.nombre'),
      estado: booleano(p.estado, 'zona.estado'),
      creadoEn: fecha(p.creadoEn, 'zona.creadoEn'),
      sucursalId: sucursal.id,
    };
    const existente = await tx.zona.findUnique({ where: { globalId } });
    if (existente && existente.sucursalId !== sucursal.id) {
      throw new Error('zona.globalId pertenece a otra sucursal');
    }
    if (existente) await tx.zona.update({ where: { id: existente.id }, data });
    else await tx.zona.create({ data: { globalId, ...data } });
    return true;
  }

  private async aplicarMesa(
    tx: Prisma.TransactionClient,
    evento: EventoSyncWire,
  ) {
    const p = objeto(evento.payload, 'payload MESA');
    const globalId = uuid(p.globalId, 'mesa.globalId');
    this.validarEnvelope(evento, p, globalId);
    const zona = await tx.zona.findUnique({
      where: { globalId: uuid(p.zonaGlobalId, 'mesa.zonaGlobalId') },
      include: { sucursal: { include: { restaurante: true } } },
    });
    if (!zona) throw new Error('Zona de mesa no existe en destino');
    if (
      zona.sucursal.globalId !== evento.sucursalGlobalId ||
      zona.sucursal.restaurante.globalId !== evento.restauranteGlobalId
    ) {
      throw new Error('Mesa fuera del alcance de zona');
    }
    const data = {
      numero: texto(p.numero, 'mesa.numero'),
      capacidad: entero(p.capacidad, 'mesa.capacidad'),
      forma: texto(p.forma, 'mesa.forma') as never,
      orientacion: texto(p.orientacion, 'mesa.orientacion') as never,
      tamanoVisual: entero(p.tamanoVisual, 'mesa.tamanoVisual'),
      estado: booleano(p.estado, 'mesa.estado'),
      creadoEn: fecha(p.creadoEn, 'mesa.creadoEn'),
      zonaId: zona.id,
    };
    const existente = await tx.mesa.findUnique({ where: { globalId } });
    if (existente) await tx.mesa.update({ where: { id: existente.id }, data });
    else await tx.mesa.create({ data: { globalId, ...data } });
    // Estado operativo (LIBRE/OCUPADA, ocupacion manual) no se replica como maestro.
    return true;
  }


  private async aplicarRolPermisos(
    tx: Prisma.TransactionClient,
    evento: EventoSyncWire,
  ) {
    const p = objeto(evento.payload, 'payload ROL_PERMISOS');
    const restauranteGlobalId = uuid(
      p.restauranteGlobalId,
      'rol.restauranteGlobalId',
    );
    if (evento.restauranteGlobalId !== restauranteGlobalId) {
      throw new Error('Rol intenta cruzar de restaurante');
    }
    const restaurante = await tx.restaurante.findUnique({
      where: { globalId: restauranteGlobalId },
    });
    if (!restaurante) throw new Error('Restaurante del rol no existe en destino');

    const clave = texto(p.clave, 'rol.clave');
    const nombre = texto(p.nombre, 'rol.nombre');
    const descripcion = textoNullable(p.descripcion, 'rol.descripcion');
    const existente = await tx.rol.findUnique({ where: { clave } });
    if (
      existente &&
      (existente.ambito !== AmbitoRol.RESTAURANTE ||
        existente.restauranteId !== restaurante.id)
    ) {
      throw new Error('CONFLICT_ROL clave pertenece a otro ambito o restaurante');
    }

    const rol = existente
      ? await tx.rol.update({
          where: { id: existente.id },
          data: { nombre, descripcion },
        })
      : await tx.rol.create({
          data: {
            clave,
            nombre,
            descripcion,
            ambito: AmbitoRol.RESTAURANTE,
            restauranteId: restaurante.id,
          },
        });

    const codigos = arreglo(p.permisos ?? [], 'rol.permisos').map((codigo, i) =>
      texto(codigo, `rol.permisos[${i}]`),
    );
    const permisos = await tx.permiso.findMany({
      where: { codigo: { in: codigos }, activo: true },
      select: { id: true, codigo: true },
    });
    const encontrados = new Set(permisos.map((permiso) => permiso.codigo));
    const faltantes = codigos.filter((codigo) => !encontrados.has(codigo));
    if (faltantes.length) {
      throw new Error(`Permisos inexistentes en destino: ${faltantes.join(', ')}`);
    }

    await tx.rolPermiso.deleteMany({ where: { rolId: rol.id } });
    if (permisos.length) {
      await tx.rolPermiso.createMany({
        data: permisos.map((permiso) => ({ rolId: rol.id, permisoId: permiso.id })),
      });
    }
    return true;
  }

  private async aplicarUsuario(
    tx: Prisma.TransactionClient,
    evento: EventoSyncWire,
  ) {
    const p = objeto(evento.payload, 'payload USUARIO');
    const globalId = uuid(p.globalId, 'usuario.globalId');
    this.validarEnvelope(evento, p, globalId, false);
    const restauranteGlobalId = uuid(
      p.restauranteGlobalId,
      'usuario.restauranteGlobalId',
    );
    if (evento.restauranteGlobalId !== restauranteGlobalId) {
      throw new Error('Usuario intenta cruzar de restaurante');
    }
    const restaurante = await tx.restaurante.findUnique({
      where: { globalId: restauranteGlobalId },
    });
    if (!restaurante) throw new Error('Restaurante del usuario no existe en destino');

    const sucursalGlobalId = uuidNullable(
      p.sucursalGlobalId,
      'usuario.sucursalGlobalId',
    );
    let sucursalId: number | null = null;
    if (sucursalGlobalId) {
      if (evento.sucursalGlobalId !== sucursalGlobalId) {
        throw new Error('Sucursal de usuario no coincide con envelope');
      }
      const sucursal = await tx.sucursal.findUnique({
        where: { globalId: sucursalGlobalId },
      });
      if (!sucursal || sucursal.restauranteId !== restaurante.id) {
        throw new Error('Sucursal del usuario no pertenece al restaurante destino');
      }
      sucursalId = sucursal.id;
    }

    const rolClave = texto(p.rolClave, 'usuario.rolClave');
    const rol = await tx.rol.findUnique({ where: { clave: rolClave } });
    if (
      !rol ||
      rol.ambito !== AmbitoRol.RESTAURANTE ||
      rol.restauranteId !== restaurante.id
    ) {
      throw new Error('Rol del usuario no existe en el restaurante destino');
    }

    const email = texto(p.email, 'usuario.email').trim().toLowerCase();
    const porEmail = await tx.usuario.findUnique({ where: { email } });
    if (porEmail && porEmail.globalId !== globalId) {
      throw new Error('CONFLICT_USUARIO_EMAIL correo pertenece a otro globalId');
    }
    const password = hashPassword(p.passwordHash, 'usuario.passwordHash');
    const existente = await tx.usuario.findUnique({ where: { globalId } });
    if (existente && existente.restauranteId !== restaurante.id) {
      throw new Error('usuario.globalId pertenece a otro restaurante');
    }

    const data = {
      nombres: texto(p.nombres, 'usuario.nombres'),
      apellidos: texto(p.apellidos, 'usuario.apellidos'),
      email,
      password,
      activo: booleano(p.activo, 'usuario.activo'),
      rolId: rol.id,
      restauranteId: restaurante.id,
      sucursalId,
    };
    if (existente) {
      await tx.usuario.update({ where: { id: existente.id }, data });
    } else {
      await tx.usuario.create({
        data: {
          globalId,
          ...data,
          creadoEn: fecha(p.creadoEn, 'usuario.creadoEn'),
        },
      });
    }
    return true;
  }

  private validarEnvelope(
    evento: EventoSyncWire,
    p: Record<string, unknown>,
    globalId: string,
    exigeSucursalEnPayload = true,
  ) {
    if (evento.aggregateGlobalId && evento.aggregateGlobalId !== globalId) {
      throw new Error('aggregateGlobalId no coincide con payload');
    }
    if (exigeSucursalEnPayload && p.sucursalGlobalId !== undefined) {
      if (p.sucursalGlobalId !== evento.sucursalGlobalId) {
        throw new Error('sucursalGlobalId no coincide con envelope');
      }
    }
    if (p.restauranteGlobalId !== undefined) {
      if (p.restauranteGlobalId !== evento.restauranteGlobalId) {
        throw new Error('restauranteGlobalId no coincide con envelope');
      }
    }
  }
}


async function idRequerido(
  delegate: { findUnique(args: unknown): Promise<{ id: number } | null> },
  valor: unknown,
  nombre: string,
): Promise<number> {
  const id = await idOpcional(delegate, valor, nombre);
  if (id === null) throw new Error(`${nombre} es obligatorio`);
  return id;
}

async function idOpcional(
  delegate: { findUnique(args: unknown): Promise<{ id: number } | null> },
  valor: unknown,
  nombre: string,
): Promise<number | null> {
  if (valor === null || valor === undefined) return null;
  const globalId = uuid(valor, `${nombre}.globalId`);
  const entidad = await delegate.findUnique({ where: { globalId } });
  if (!entidad) throw new Error(`${nombre} no existe en destino`);
  return entidad.id;
}

function objeto(valor: unknown, nombre: string): Record<string, unknown> {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) {
    throw new Error(`${nombre} debe ser objeto`);
  }
  return valor as Record<string, unknown>;
}
function arreglo(valor: unknown, nombre: string): unknown[] {
  if (!Array.isArray(valor)) throw new Error(`${nombre} debe ser arreglo`);
  return valor;
}
function texto(valor: unknown, nombre: string): string {
  if (typeof valor !== 'string' || !valor.trim()) throw new Error(`${nombre} invalido`);
  return valor;
}
function textoNullable(valor: unknown, nombre: string): string | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor !== 'string') throw new Error(`${nombre} invalido`);
  return valor;
}
function booleano(valor: unknown, nombre: string): boolean {
  if (typeof valor !== 'boolean') throw new Error(`${nombre} invalido`);
  return valor;
}
function entero(valor: unknown, nombre: string): number {
  if (typeof valor !== 'number' || !Number.isInteger(valor)) throw new Error(`${nombre} invalido`);
  return valor;
}
function enteroNullable(valor: unknown, nombre: string): number | null {
  if (valor === null || valor === undefined) return null;
  return entero(valor, nombre);
}
function decimal(valor: unknown, nombre: string): Prisma.Decimal {
  if (typeof valor !== 'string' && typeof valor !== 'number') throw new Error(`${nombre} invalido`);
  try {
    return new Prisma.Decimal(valor);
  } catch {
    throw new Error(`${nombre} invalido`);
  }
}
function fecha(valor: unknown, nombre: string): Date {
  if (typeof valor !== 'string') throw new Error(`${nombre} invalida`);
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) throw new Error(`${nombre} invalida`);
  return d;
}
function fechaNullable(valor: unknown, nombre: string): Date | null {
  if (valor === null || valor === undefined) return null;
  return fecha(valor, nombre);
}
function uuid(valor: unknown, nombre: string): string {
  if (
    typeof valor !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(valor)
  ) {
    throw new Error(`${nombre} debe ser UUID`);
  }
  return valor;
}

function uuidNullable(valor: unknown, nombre: string): string | null {
  if (valor === null || valor === undefined) return null;
  return uuid(valor, nombre);
}


function valorJson(valor: unknown, nombre: string): Prisma.InputJsonValue {
  if (valor === undefined) throw new Error(`${nombre} invalido`);
  if (valor === null) return Prisma.JsonNull as unknown as Prisma.InputJsonValue;
  try {
    JSON.stringify(valor);
  } catch {
    throw new Error(`${nombre} invalido`);
  }
  return valor as Prisma.InputJsonValue;
}

function hashPassword(valor: unknown, nombre: string): string {
  const hash = texto(valor, nombre);
  if (!/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(hash)) {
    throw new Error(`${nombre} no es un hash bcrypt valido`);
  }
  return hash;
}

