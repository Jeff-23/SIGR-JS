import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  EstadoCaja,
  EstadoMesa,
  EstadoPedido,
  EstadoVenta,
  OrigenVenta,
  Prisma,
  TipoEventoOperacional,
  TipoMetodoPago,
  TipoMovimientoCaja,
  TipoMovimientoPuntos,
  Venta,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

import {
  AjustesVentaDto,
  CrearVentaDirectaDto,
  CrearVentaManualDto,
  CrearVentaPedidoDto,
} from './dto/crear-venta.dto';

import { RegistrarPagoDto } from './dto/registrar-pago.dto';
import { DevolverPagoDto, ReversarVentaDto } from './dto/devolver-pago.dto';
import { ListarVentasDto } from './dto/listar-ventas.dto';
import { DividirCuentaDto } from './dto/dividir-cuenta.dto';
import { ActualizarLiquidacionVentaDto } from './dto/actualizar-liquidacion-venta.dto';

import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';
import { InventarioService } from '../inventario/inventario.service';
import { dinero } from '../../plataforma/dinero';
import { fechaOperativa } from '../../plataforma/fecha-operativa';
import {
  hashSolicitud,
  normalizarClaveIdempotencia,
  validarReplayIdempotente,
} from '../../plataforma/idempotencia';
import {
  configuracionImpresionTermica,
  dineroTermico,
  documentoTermicoHtml,
  escaparHtml,
  fechaLocalTermica,
} from '../../plataforma/impresion-termica';

@Injectable()
export class VentasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventarioService: InventarioService,
  ) {}

  private esSuperadmin(usuarioActual: UsuarioAutenticado) {
    return (
      usuarioActual.rol === 'SUPERADMIN' && usuarioActual.restauranteId === null
    );
  }

  private filtroSucursal(
    usuarioActual: UsuarioAutenticado,
  ): Prisma.SucursalWhereInput {
    return {
      estado: true,

      restaurante: {
        estado: true,

        ...(!this.esSuperadmin(usuarioActual)
          ? {
              id: usuarioActual.restauranteId,
            }
          : {}),
      },

      ...(usuarioActual.sucursalId !== null
        ? {
            id: usuarioActual.sucursalId,
          }
        : {}),
    };
  }

  private async resolverClienteId(
    tx: Prisma.TransactionClient,
    clienteId: number | undefined,
    sucursalId: number,
  ) {
    if (clienteId === undefined) {
      return null;
    }

    const cliente = await tx.cliente.findFirst({
      where: {
        id: clienteId,
        estado: true,

        restaurante: {
          sucursales: {
            some: {
              id: sucursalId,
            },
          },
        },
      },

      select: {
        id: true,
      },
    });

    if (!cliente) {
      throw new NotFoundException(
        'Cliente no encontrado o no pertenece al restaurante de la sucursal',
      );
    }

    return cliente.id;
  }

  private async impuestoConfigurado(
    tx: Prisma.TransactionClient,
    sucursalId: number,
    subtotal: Prisma.Decimal,
  ) {
    const sucursal = await tx.sucursal.findUniqueOrThrow({
      where: { id: sucursalId },
      select: { restauranteId: true },
    });
    const configSucursal = await tx.configuracionSucursal.findUnique({
      where: {
        sucursalId_clave: { sucursalId, clave: 'PORCENTAJE_IMPUESTO' },
      },
    });
    const configRestaurante = await tx.configuracionRestaurante.findUnique({
      where: {
        restauranteId_clave: {
          restauranteId: sucursal.restauranteId,
          clave: 'PORCENTAJE_IMPUESTO',
        },
      },
    });
    const valor = configSucursal?.valor ?? configRestaurante?.valor ?? 0;
    const porcentaje = typeof valor === 'number' ? valor : 0;
    return subtotal.mul(porcentaje).div(100).toDecimalPlaces(2).toNumber();
  }

  private validarYCalcularTotales(
    subtotal: Prisma.Decimal,
    data: AjustesVentaDto,
    usuarioActual: UsuarioAutenticado,
    descuentoAutomatico = new Prisma.Decimal(0),
  ) {
    const descuentoManual = dinero(data.descuentos ?? 0, 'descuentos');
    const descuentos = descuentoManual.plus(descuentoAutomatico);

    const impuestos = dinero(data.impuestos ?? 0, 'impuestos');

    const impoconsumo = dinero(data.impoconsumo ?? 0, 'impoconsumo');

    const propina = dinero(data.propina ?? 0, 'propina');

    if (
      descuentoManual.gt(0) &&
      !this.esSuperadmin(usuarioActual) &&
      !usuarioActual.permisos.includes('DESCUENTOS_APLICAR')
    ) {
      throw new ForbiddenException('No tienes permiso para aplicar descuentos');
    }

    if (descuentos.gt(subtotal)) {
      throw new BadRequestException(
        'El descuento no puede superar el subtotal de la venta',
      );
    }

    const total = subtotal
      .minus(descuentos)
      .plus(impuestos)
      .plus(impoconsumo)
      .plus(propina);

    if (total.lt(0)) {
      throw new BadRequestException(
        'El total de la venta no puede ser negativo',
      );
    }

    return {
      descuentos,
      impuestos,
      impoconsumo,
      propina,
      total,
    };
  }

  private async descuentosAutomaticos(
    tx: Prisma.TransactionClient,
    data: AjustesVentaDto,
    sucursalId: number,
    clienteId: number | null,
    fecha: Date,
    subtotal: Prisma.Decimal,
    lineas: { productoId: number; subtotal: Prisma.Decimal }[],
  ) {
    const sucursal = await tx.sucursal.findUniqueOrThrow({
      where: { id: sucursalId },
      select: { restauranteId: true },
    });
    const partes = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(fecha);
    const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(
      partes.find((p) => p.type === 'weekday')?.value ?? '',
    );
    const hour = `${partes.find((p) => p.type === 'hour')?.value}:${partes.find((p) => p.type === 'minute')?.value}`;
    let couponId: number | null = null;
    let couponPromotionId: number | undefined;
    if (data.codigoPromocional) {
      const codigo = data.codigoPromocional.trim().toUpperCase();
      const coupon = await tx.cupon.findUnique({
        where: {
          restauranteId_codigo: {
            restauranteId: sucursal.restauranteId,
            codigo,
          },
        },
      });
      if (
        !coupon ||
        !coupon.activo ||
        (coupon.clienteId !== null && coupon.clienteId !== clienteId) ||
        (coupon.usosMaximos !== null &&
          coupon.usosActuales >= coupon.usosMaximos) ||
        (coupon.validoDesde && fecha < coupon.validoDesde) ||
        (coupon.validoHasta && fecha > coupon.validoHasta)
      )
        throw new BadRequestException(
          'El cupón no existe, expiró o no está disponible',
        );
      couponId = coupon.id;
      couponPromotionId = coupon.promocionId;
    }
    const promos = await tx.promocion.findMany({
      where: {
        restauranteId: sucursal.restauranteId,
        activa: true,
        fechaInicio: { lte: fecha },
        fechaFin: { gte: fecha },
        diasSemana: { has: weekday },
        OR: [{ sucursalId: null }, { sucursalId }],
        ...(couponPromotionId
          ? { id: couponPromotionId }
          : { requiereCupon: false }),
      },
      include: { productos: true },
    });
    const candidates = promos
      .filter(
        (p) =>
          (!p.horaInicio ||
            !p.horaFin ||
            (p.horaInicio <= p.horaFin
              ? p.horaInicio <= hour && p.horaFin >= hour
              : p.horaInicio <= hour || p.horaFin >= hour)) &&
          subtotal.gte(p.compraMinima),
      )
      .map((p) => {
        const base = p.productos.length
          ? lineas
              .filter((l) =>
                p.productos.some((x) => x.productoId === l.productoId),
              )
              .reduce((sum, l) => sum.plus(l.subtotal), new Prisma.Decimal(0))
          : subtotal;
        const monto =
          p.tipo === 'PORCENTAJE' ? base.mul(p.valor).div(100) : p.valor;
        return {
          promo: p,
          monto: Prisma.Decimal.min(base, monto).toDecimalPlaces(2),
        };
      })
      .filter((x) => x.monto.gt(0));
    const combinables = candidates.filter((x) => x.promo.combinable);
    const independiente = candidates
      .filter((x) => !x.promo.combinable)
      .sort((a, b) => b.monto.comparedTo(a.monto))[0];
    const elegidas = couponId
      ? candidates.slice(0, 1)
      : combinables
            .reduce((s, x) => s.plus(x.monto), new Prisma.Decimal(0))
            .gt(independiente?.monto ?? 0)
        ? combinables
        : independiente
          ? [independiente]
          : [];
    const limite = subtotal.minus(data.descuentos ?? 0);
    let restante = Prisma.Decimal.max(0, limite);
    const aplicaciones = elegidas
      .map(({ promo, monto }) => {
        const aplicado = Prisma.Decimal.min(restante, monto);
        restante = restante.minus(aplicado);
        return {
          origen: couponId ? 'CUPON' : 'PROMOCION',
          nombre: promo.nombre,
          monto: aplicado,
          promocionId: promo.id,
          cuponId: couponId,
        };
      })
      .filter((x) => x.monto.gt(0));
    if (couponId && aplicaciones.length === 0)
      throw new BadRequestException('El cupón no aplica a esta venta');
    let puntosUsados = 0;
    let movimientoRedencionId: number | null = null;
    if (data.usarPuntos) {
      if (!clienteId)
        throw new BadRequestException('Selecciona un cliente para usar puntos');
      const cuenta = await tx.cuentaFidelizacion.findUnique({
        where: { clienteId },
      });
      if (!cuenta || cuenta.saldoPuntos < data.usarPuntos)
        throw new BadRequestException('El cliente no tiene puntos suficientes');
      puntosUsados = Math.min(data.usarPuntos, Math.floor(restante.toNumber()));
      if (puntosUsados > 0) {
        const saldo = cuenta.saldoPuntos - puntosUsados;
        await tx.cuentaFidelizacion.update({
          where: { id: cuenta.id },
          data: { saldoPuntos: saldo },
        });
        const movimiento = await tx.movimientoPuntos.create({
          data: {
            cuentaId: cuenta.id,
            tipo: TipoMovimientoPuntos.REDENCION,
            puntos: -puntosUsados,
            saldoPosterior: saldo,
            motivo: 'Redención en venta',
          },
        });
        movimientoRedencionId = movimiento.id;
        aplicaciones.push({
          origen: 'PUNTOS',
          nombre: 'Puntos de fidelización',
          monto: new Prisma.Decimal(puntosUsados),
          promocionId: null,
          cuponId: null,
        });
      }
    }
    return {
      aplicaciones,
      total: aplicaciones.reduce(
        (s, x) => s.plus(x.monto),
        new Prisma.Decimal(0),
      ),
      couponId,
      movimientoRedencionId,
    };
  }

  private async acreditarPuntos(tx: Prisma.TransactionClient, venta: Venta) {
    if (!venta.clienteId) return;
    const existe = await tx.movimientoPuntos.count({
      where: { ventaId: venta.id, tipo: TipoMovimientoPuntos.ACUMULACION },
    });
    if (existe) return;
    const base = Math.floor(Number(venta.total) / 1000);
    if (base < 1) return;
    const cuenta = await tx.cuentaFidelizacion.upsert({
      where: { clienteId: venta.clienteId },
      create: { clienteId: venta.clienteId },
      update: {},
    });
    const nivel = await tx.nivelFidelizacion.findFirst({
      where: {
        restaurante: { sucursales: { some: { id: venta.sucursalId } } },
        activo: true,
        puntosMinimos: { lte: cuenta.puntosHistoricos },
      },
      orderBy: { puntosMinimos: 'desc' },
    });
    const puntos = Math.max(
      1,
      Math.floor(base * Number(nivel?.multiplicador ?? 1)),
    );
    const saldo = cuenta.saldoPuntos + puntos;
    const historicos = cuenta.puntosHistoricos + puntos;
    const nivelNuevo = await tx.nivelFidelizacion.findFirst({
      where: {
        restaurante: { sucursales: { some: { id: venta.sucursalId } } },
        activo: true,
        puntosMinimos: { lte: historicos },
      },
      orderBy: { puntosMinimos: 'desc' },
    });
    await tx.cuentaFidelizacion.update({
      where: { id: cuenta.id },
      data: {
        saldoPuntos: saldo,
        puntosHistoricos: historicos,
        nivelId: nivelNuevo?.id ?? null,
      },
    });
    await tx.movimientoPuntos.create({
      data: {
        cuentaId: cuenta.id,
        ventaId: venta.id,
        tipo: TipoMovimientoPuntos.ACUMULACION,
        puntos,
        saldoPosterior: saldo,
        motivo: 'Compra pagada',
      },
    });
  }

  private async revertirPuntos(tx: Prisma.TransactionClient, ventaId: number) {
    const movimientos = await tx.movimientoPuntos.findMany({
      where: { ventaId },
    });
    if (
      movimientos.length === 0 ||
      movimientos.some((item) => item.tipo === TipoMovimientoPuntos.REVERSO)
    )
      return;
    const cuentaId = movimientos[0].cuentaId;
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "CuentaFidelizacion" WHERE "id" = ${cuentaId} FOR UPDATE`,
    );
    const cuenta = await tx.cuentaFidelizacion.findUniqueOrThrow({
      where: { id: cuentaId },
    });
    const neto = movimientos.reduce((sum, item) => sum + item.puntos, 0);
    const acumulados = movimientos
      .filter((item) => item.tipo === TipoMovimientoPuntos.ACUMULACION)
      .reduce((sum, item) => sum + item.puntos, 0);
    const saldo = cuenta.saldoPuntos - neto;
    if (saldo < 0)
      throw new BadRequestException(
        'El cliente debe reintegrar puntos antes de reversar esta venta',
      );
    await tx.cuentaFidelizacion.update({
      where: { id: cuentaId },
      data: {
        saldoPuntos: saldo,
        puntosHistoricos: Math.max(0, cuenta.puntosHistoricos - acumulados),
      },
    });
    await tx.movimientoPuntos.create({
      data: {
        cuentaId,
        ventaId,
        tipo: TipoMovimientoPuntos.REVERSO,
        puntos: -neto,
        saldoPosterior: saldo,
        motivo: 'Reversión de venta',
      },
    });
  }

  async crearDesdePedido(
    data: CrearVentaPedidoDto,
    usuarioActual: UsuarioAutenticado,
    claveRecibida: string | undefined,
  ) {
    const clave = normalizarClaveIdempotencia(claveRecibida);
    const solicitudHash = hashSolicitud({ operacion: 'VENTA_PEDIDO', data });
    const ventaId = await this.prisma.transaccionSerializable(async (tx) => {
      const pedido = await tx.pedido.findFirst({
        where: {
          id: data.pedidoId,

          sucursal: this.filtroSucursal(usuarioActual),
        },

        include: {
          detalles: true,
          venta: true,
          factura: true,
          domicilio: true,
        },
      });

      if (!pedido) {
        throw new NotFoundException('Pedido no encontrado');
      }

      if (pedido.venta) {
        if (pedido.venta.idempotenciaClave === clave) {
          validarReplayIdempotente(
            pedido.venta.idempotenciaHash,
            solicitudHash,
          );
          return pedido.venta.id;
        }
        throw new BadRequestException(
          'Este pedido ya tiene una venta asociada',
        );
      }

      if (pedido.factura || pedido.estado === EstadoPedido.FACTURADO) {
        throw new BadRequestException(
          'Este pedido ya fue procesado mediante el flujo anterior de facturación',
        );
      }

      if (pedido.estado === EstadoPedido.CANCELADO) {
        throw new BadRequestException('No se puede vender un pedido cancelado');
      }

      const clienteId = await this.resolverClienteId(
        tx,
        data.clienteId,
        pedido.sucursalId,
      );

      const subtotal = pedido.detalles.reduce(
        (total, detalle) => total.plus(detalle.subtotal),

        new Prisma.Decimal(0),
      );

      const impuestos =
        data.impuestos ??
        (await this.impuestoConfigurado(tx, pedido.sucursalId, subtotal));
      const automaticos = await this.descuentosAutomaticos(
        tx,
        data,
        pedido.sucursalId,
        clienteId,
        new Date(),
        subtotal,
        pedido.detalles.map((detalle) => ({
          productoId: detalle.productoId,
          subtotal: detalle.subtotal,
        })),
      );
      const ajustes = this.validarYCalcularTotales(
        subtotal,
        { ...data, impuestos },
        usuarioActual,
        automaticos.total,
      );
      const domicilioCosto = pedido.domicilio?.costo ?? new Prisma.Decimal(0);
      const totalVenta = ajustes.total.plus(domicilioCosto);

      const ventaBase = await tx.venta.create({
        data: {
          origen: OrigenVenta.PEDIDO,

          estado: totalVenta.eq(0)
            ? EstadoVenta.PAGADA
            : EstadoVenta.PENDIENTE_PAGO,

          subtotal,

          descuentos: ajustes.descuentos,

          impuestos: ajustes.impuestos,

          impoconsumo: ajustes.impoconsumo,

          propina: ajustes.propina,

          total: totalVenta,

          domicilioCosto,

          fechaOperacion: new Date(),

          sucursalId: pedido.sucursalId,

          usuarioId: usuarioActual.id,

          pedidoId: pedido.id,

          clienteId,
          idempotenciaClave: clave,
          idempotenciaHash: solicitudHash,
        },
      });

      await tx.detalleVenta.createMany({
        data: pedido.detalles.map((detalle) => ({
          ventaId: ventaBase.id,
          productoId: detalle.productoId,
          cantidad: detalle.cantidad,
          precioUnitario: detalle.precioUnitario,
          subtotal: detalle.subtotal,
        })),
      });
      if (automaticos.aplicaciones.length)
        await tx.aplicacionDescuento.createMany({
          data: automaticos.aplicaciones.map((item) => ({
            ...item,
            ventaId: ventaBase.id,
          })),
        });
      if (automaticos.couponId)
        await tx.cupon.update({
          where: { id: automaticos.couponId },
          data: { usosActuales: { increment: 1 } },
        });
      if (automaticos.movimientoRedencionId)
        await tx.movimientoPuntos.update({
          where: { id: automaticos.movimientoRedencionId },
          data: { ventaId: ventaBase.id },
        });

      await this.inventarioService.descontarPorVenta(tx, {
        ventaId: ventaBase.id,
        sucursalId: pedido.sucursalId,
        usuarioActual,
        detalles: pedido.detalles.map((detalle) => ({
          productoId: detalle.productoId,
          cantidad: detalle.cantidad,
        })),
      });

      /*
       * =================================================
       * ESTADO DE MESA AL PASAR A COBRO
       * =================================================
       *
       * Crear una venta NO libera automáticamente
       * la mesa.
       *
       * Si existe saldo pendiente:
       * OCUPADA -> PENDIENTE_PAGO
       *
       * Si la venta queda pagada inmediatamente:
       * OCUPADA -> LIBRE
       */
      if (pedido.mesaId !== null) {
        await tx.mesa.updateMany({
          where: {
            id: pedido.mesaId,

            estado: true,

            situacion: {
              in: [EstadoMesa.OCUPADA, EstadoMesa.PENDIENTE_PAGO],
            },
          },

          data: {
            situacion:
              pedido.estado === EstadoPedido.ENTREGADO
                ? ventaBase.estado === EstadoVenta.PAGADA
                  ? EstadoMesa.LIBRE
                  : EstadoMesa.PENDIENTE_PAGO
                : EstadoMesa.OCUPADA,
            ocupacionManual: false,
            ocupadaManualEn: null,
            ocupadaManualPorId: null,
          },
        });
      }

      return ventaBase.id;
    });

    return this.prisma.venta.findUniqueOrThrow({
      where: { id: ventaId },
      include: {
        detalles: true,
        pagos: true,
        factura: { include: { documentoElectronico: true } },
        cliente: true,
        aplicacionesDescuento: true,
      },
    });
  }

  /*
   * =====================================================
   * CORTE COMERCIAL
   *
   * Utiliza Venta.fechaOperacion.
   *
   * Esto permite que una venta registrada posteriormente
   * mediante MANUAL_CIERRE pertenezca al día real en que
   * ocurrió y no al día en que fue digitada.
   *
   * IMPORTANTE:
   * esto NO es todavía el módulo formal de Caja.
   * =====================================================
   */
  async obtenerCorteComercial(
    fechaInicio: string | undefined,
    fechaFin: string | undefined,
    usuarioActual: UsuarioAutenticado,
  ) {
    const hoy = new Date();

    hoy.setHours(0, 0, 0, 0);

    const inicio = fechaInicio ? new Date(fechaInicio) : hoy;

    const fin = fechaFin ? new Date(fechaFin) : new Date();

    if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) {
      throw new BadRequestException('Las fechas indicadas no son válidas');
    }

    if (inicio > fin) {
      throw new BadRequestException(
        'La fecha inicial no puede ser posterior a la fecha final',
      );
    }

    const ventas = await this.prisma.venta.findMany({
      where: {
        fechaOperacion: {
          gte: inicio,
          lte: fin,
        },

        estado: {
          not: EstadoVenta.ANULADA,
        },

        sucursal: this.filtroSucursal(usuarioActual),
      },

      include: {
        pagos: {
          include: {
            metodoPago: true,
            devoluciones: true,
          },
        },
      },

      orderBy: {
        fechaOperacion: 'asc',
      },
    });

    let totalVentas = new Prisma.Decimal(0);

    let totalPagado = new Prisma.Decimal(0);

    const desglosePagosDecimal: Record<string, Prisma.Decimal> = {};

    const desgloseOrigenDecimal: Record<string, Prisma.Decimal> = {};

    const ventasPorEstado: Record<string, number> = {};

    for (const venta of ventas) {
      totalVentas = totalVentas.add(venta.total);

      if (!desgloseOrigenDecimal[venta.origen]) {
        desgloseOrigenDecimal[venta.origen] = new Prisma.Decimal(0);
      }

      desgloseOrigenDecimal[venta.origen] = desgloseOrigenDecimal[
        venta.origen
      ].add(venta.total);

      if (!ventasPorEstado[venta.estado]) {
        ventasPorEstado[venta.estado] = 0;
      }

      ventasPorEstado[venta.estado] += 1;

      for (const pago of venta.pagos) {
        totalPagado = totalPagado.add(pago.monto);

        const metodo = pago.metodoPago.nombre;

        if (!desglosePagosDecimal[metodo]) {
          desglosePagosDecimal[metodo] = new Prisma.Decimal(0);
        }

        desglosePagosDecimal[metodo] = desglosePagosDecimal[metodo].add(
          pago.monto,
        );
      }
    }

    const totalPendiente = totalVentas.sub(totalPagado);

    const desglosePagos: Record<string, number> = {};

    for (const [metodo, monto] of Object.entries(desglosePagosDecimal)) {
      desglosePagos[metodo] = monto.toNumber();
    }

    const desgloseOrigen: Record<string, number> = {};

    for (const [origen, monto] of Object.entries(desgloseOrigenDecimal)) {
      desgloseOrigen[origen] = monto.toNumber();
    }

    return {
      fechaInicio: inicio,

      fechaFin: fin,

      cantidadVentas: ventas.length,

      totalVentas: totalVentas.toNumber(),

      totalPagado: totalPagado.toNumber(),

      totalPendiente: totalPendiente.toNumber(),

      desglosePagos,

      desgloseOrigen,

      ventasPorEstado,
    };
  }

  private async crearSinPedido(
    data: CrearVentaDirectaDto | CrearVentaManualDto,

    origen: OrigenVenta,

    usuarioActual: UsuarioAutenticado,
    claveRecibida: string | undefined,
  ) {
    const clave = normalizarClaveIdempotencia(claveRecibida);
    const solicitudHash = hashSolicitud({ operacion: origen, data });
    const ventaId = await this.prisma.transaccionSerializable(async (tx) => {
      const sucursal = await tx.sucursal.findFirst({
        where: {
          AND: [
            {
              id: data.sucursalId,
            },

            this.filtroSucursal(usuarioActual),
          ],
        },
      });

      if (!sucursal) {
        throw new NotFoundException('Sucursal no encontrada');
      }

      const replay = await tx.venta.findUnique({
        where: {
          sucursalId_idempotenciaClave: {
            sucursalId: sucursal.id,
            idempotenciaClave: clave,
          },
        },
        select: { id: true, idempotenciaHash: true },
      });
      if (replay) {
        validarReplayIdempotente(replay.idempotenciaHash, solicitudHash);
        return replay.id;
      }

      const clienteId = await this.resolverClienteId(
        tx,
        data.clienteId,
        sucursal.id,
      );

      let fechaOperacion = new Date();

      if (origen === OrigenVenta.MANUAL_CIERRE) {
        const manual = data as CrearVentaManualDto;
        fechaOperacion = fechaOperativa(manual.fechaOperacion);
        if (
          manual.impuestos === undefined ||
          manual.impoconsumo === undefined
        ) {
          throw new BadRequestException(
            'La digitación manual debe indicar impuestos e impoconsumo originales, incluso si son cero',
          );
        }
        if (!manual.numeroComandaPapel.trim() || !manual.numeroSoporte.trim()) {
          throw new BadRequestException(
            'La comanda y el soporte de papel son obligatorios',
          );
        }
      }

      const cantidades = new Map<number, number>();

      for (const detalle of data.detalles) {
        if (
          origen === OrigenVenta.MANUAL_CIERRE &&
          detalle.precioUnitario === undefined
        ) {
          throw new BadRequestException(
            'Cada detalle manual debe conservar su precio unitario original',
          );
        }
        if (
          origen !== OrigenVenta.MANUAL_CIERRE &&
          detalle.precioUnitario !== undefined
        ) {
          throw new BadRequestException(
            'El precio sólo puede informarse en la digitación manual de soportes',
          );
        }
        cantidades.set(
          detalle.productoId,

          (cantidades.get(detalle.productoId) ?? 0) + detalle.cantidad,
        );
      }

      const idsProductos = [...cantidades.keys()];

      const productos = await tx.producto.findMany({
        where: {
          id: {
            in: idsProductos,
          },

          estado: true,

          categoria: {
            estado: true,

            sucursalId: sucursal.id,
          },
        },
      });

      if (productos.length !== idsProductos.length) {
        throw new NotFoundException(
          'Uno o más productos no existen o no pertenecen a la sucursal',
        );
      }

      const productosPorId = new Map(
        productos.map((producto) => [producto.id, producto]),
      );

      let subtotal = new Prisma.Decimal(0);

      const detallesPreparados: {
        productoId: number;
        cantidad: number;
        precioUnitario: Prisma.Decimal;
        subtotal: Prisma.Decimal;
      }[] = [];

      for (const [productoId, cantidad] of cantidades) {
        const producto = productosPorId.get(productoId);

        const entradasProducto = data.detalles.filter(
          (detalle) => detalle.productoId === productoId,
        );
        const preciosOriginales = new Set(
          entradasProducto.map((detalle) => detalle.precioUnitario),
        );
        if (preciosOriginales.size > 1) {
          throw new BadRequestException(
            `El producto ${productoId} aparece con precios originales diferentes`,
          );
        }
        const precioUnitario =
          origen === OrigenVenta.MANUAL_CIERRE
            ? dinero(entradasProducto[0].precioUnitario, 'precioUnitario')
            : producto.precio;
        const subtotalDetalle = precioUnitario.mul(cantidad);

        subtotal = subtotal.plus(subtotalDetalle);

        detallesPreparados.push({
          productoId,
          cantidad,

          precioUnitario,

          subtotal: subtotalDetalle,
        });
      }

      const impuestos =
        origen === OrigenVenta.MANUAL_CIERRE
          ? data.impuestos
          : (data.impuestos ??
            (await this.impuestoConfigurado(tx, sucursal.id, subtotal)));
      const automaticos = await this.descuentosAutomaticos(
        tx,
        data,
        sucursal.id,
        clienteId,
        fechaOperacion,
        subtotal,
        detallesPreparados,
      );
      const ajustes = this.validarYCalcularTotales(
        subtotal,
        { ...data, impuestos },
        usuarioActual,
        automaticos.total,
      );

      let ventaBase: Venta;
      try {
        ventaBase = await tx.venta.create({
          data: {
            origen,

            estado: ajustes.total.eq(0)
              ? EstadoVenta.PAGADA
              : EstadoVenta.PENDIENTE_PAGO,

            subtotal,

            descuentos: ajustes.descuentos,

            impuestos: ajustes.impuestos,

            impoconsumo: ajustes.impoconsumo,

            propina: ajustes.propina,

            total: ajustes.total,

            fechaOperacion,

            ...(origen === OrigenVenta.MANUAL_CIERRE
              ? {
                  numeroComandaPapel: (
                    data as CrearVentaManualDto
                  ).numeroComandaPapel.trim(),
                  numeroSoporte: (
                    data as CrearVentaManualDto
                  ).numeroSoporte.trim(),
                  soporteArchivoRef:
                    (data as CrearVentaManualDto).soporteArchivoRef?.trim() ??
                    null,
                }
              : {}),

            sucursalId: sucursal.id,

            usuarioId: usuarioActual.id,

            clienteId,
            idempotenciaClave: clave,
            idempotenciaHash: solicitudHash,
          },
        });
      } catch (error) {
        if (
          origen === OrigenVenta.MANUAL_CIERRE &&
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          throw new ConflictException(
            'La comanda o el soporte de papel ya fue digitado en esta sucursal',
          );
        }
        throw error;
      }

      await tx.detalleVenta.createMany({
        data: detallesPreparados.map((detalle) => ({
          ventaId: ventaBase.id,
          productoId: detalle.productoId,
          cantidad: detalle.cantidad,
          precioUnitario: detalle.precioUnitario,
          subtotal: detalle.subtotal,
        })),
      });
      if (automaticos.aplicaciones.length)
        await tx.aplicacionDescuento.createMany({
          data: automaticos.aplicaciones.map((item) => ({
            ...item,
            ventaId: ventaBase.id,
          })),
        });
      if (automaticos.couponId)
        await tx.cupon.update({
          where: { id: automaticos.couponId },
          data: { usosActuales: { increment: 1 } },
        });
      if (automaticos.movimientoRedencionId)
        await tx.movimientoPuntos.update({
          where: { id: automaticos.movimientoRedencionId },
          data: { ventaId: ventaBase.id },
        });

      await this.inventarioService.descontarPorVenta(tx, {
        ventaId: ventaBase.id,
        sucursalId: sucursal.id,
        usuarioActual,
        detalles: detallesPreparados.map((detalle) => ({
          productoId: detalle.productoId,
          cantidad: detalle.cantidad,
        })),
      });

      return ventaBase.id;
    });

    return this.prisma.venta.findUniqueOrThrow({
      where: { id: ventaId },
      include: {
        detalles: true,
        pagos: true,
        factura: { include: { documentoElectronico: true } },
        cliente: true,
        aplicacionesDescuento: true,
      },
    });
  }

  crearDirecta(
    data: CrearVentaDirectaDto,
    usuarioActual: UsuarioAutenticado,
    claveIdempotencia: string | undefined,
  ) {
    return this.crearSinPedido(
      data,
      OrigenVenta.DIRECTA,
      usuarioActual,
      claveIdempotencia,
    );
  }

  crearManual(
    data: CrearVentaManualDto,
    usuarioActual: UsuarioAutenticado,
    claveIdempotencia: string | undefined,
  ) {
    return this.crearSinPedido(
      data,
      OrigenVenta.MANUAL_CIERRE,
      usuarioActual,
      claveIdempotencia,
    );
  }

  findAll(
    usuarioActual: UsuarioAutenticado,
    filtros: ListarVentasDto = new ListarVentasDto(),
  ) {
    if (
      filtros.desde &&
      filtros.hasta &&
      new Date(filtros.desde).getTime() > new Date(filtros.hasta).getTime()
    ) {
      throw new BadRequestException(
        'La fecha desde no puede ser posterior a la fecha hasta',
      );
    }
    return this.prisma.venta.findMany({
      where: {
        sucursal: this.filtroSucursal(usuarioActual),
        ...(filtros.sucursalId ? { sucursalId: filtros.sucursalId } : {}),
        ...(filtros.estado ? { estado: filtros.estado } : {}),
        ...(filtros.origen ? { origen: filtros.origen } : {}),
        ...(filtros.desde || filtros.hasta
          ? {
              fechaOperacion: {
                ...(filtros.desde ? { gte: new Date(filtros.desde) } : {}),
                ...(filtros.hasta ? { lte: new Date(filtros.hasta) } : {}),
              },
            }
          : {}),
      },

      include: {
        detalles: {
          include: {
            producto: true,
          },
        },

        pagos: {
          include: {
            metodoPago: true,
            devoluciones: true,
          },
        },

        factura: { include: { documentoElectronico: true } },
        cliente: true,
        aplicacionesDescuento: true,
        pedido: { include: { mesa: true } },
        divisionesCuenta: { include: { pagos: true }, orderBy: { id: 'asc' } },
      },

      orderBy: {
        fechaOperacion: 'desc',
      },
      skip: (filtros.pagina - 1) * filtros.limite,
      take: filtros.limite,
    });
  }

  async findOne(id: number, usuarioActual: UsuarioAutenticado) {
    const venta = await this.prisma.venta.findFirst({
      where: {
        id,

        sucursal: this.filtroSucursal(usuarioActual),
      },

      include: {
        detalles: {
          include: {
            producto: true,
          },
        },

        pagos: {
          include: {
            metodoPago: true,
            devoluciones: true,
          },
        },

        factura: { include: { documentoElectronico: true } },
        pedido: { include: { mesa: true } },
        cliente: true,
        aplicacionesDescuento: true,
        divisionesCuenta: { include: { pagos: true }, orderBy: { id: 'asc' } },
      },
    });

    if (!venta) {
      throw new NotFoundException('Venta no encontrada');
    }

    return venta;
  }

  async actualizarLiquidacion(
    ventaId: number,
    data: ActualizarLiquidacionVentaDto,
    usuarioActual: UsuarioAutenticado,
  ) {
    return this.prisma.transaccionSerializable(async (tx) => {
      const alcanzable = await tx.venta.findFirst({
        where: { id: ventaId, sucursal: this.filtroSucursal(usuarioActual) },
        select: { id: true },
      });
      if (!alcanzable) throw new NotFoundException('Venta no encontrada');

      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "Venta" WHERE "id" = ${alcanzable.id} FOR UPDATE`,
      );

      const venta = await tx.venta.findUniqueOrThrow({
        where: { id: alcanzable.id },
        include: {
          pagos: { select: { id: true } },
          factura: { select: { id: true } },
          divisionesCuenta: { select: { id: true } },
          aplicacionesDescuento: { select: { monto: true } },
        },
      });
      if (venta.estado === EstadoVenta.ANULADA)
        throw new BadRequestException(
          'No se puede modificar una venta anulada',
        );
      if (venta.pagos.length > 0)
        throw new BadRequestException(
          'Descuento, propina y cliente deben definirse antes del primer pago',
        );
      if (venta.factura)
        throw new BadRequestException(
          'La liquidación no puede modificarse después de crear la factura',
        );
      if (venta.divisionesCuenta.length > 0)
        throw new BadRequestException(
          'La liquidación debe definirse antes de dividir la cuenta',
        );

      const descuentoAutomatico = venta.aplicacionesDescuento.reduce(
        (total, item) => total.plus(item.monto),
        new Prisma.Decimal(0),
      );
      const descuentos = dinero(data.descuentos, 'descuentos');
      const propina = dinero(data.propina, 'propina');
      if (descuentos.lt(descuentoAutomatico))
        throw new BadRequestException(
          'El descuento no puede ser inferior a los descuentos automáticos ya aplicados',
        );
      const descuentoManual = descuentos.minus(descuentoAutomatico);
      if (
        !descuentos.eq(venta.descuentos) &&
        descuentoManual.gt(0) &&
        !this.esSuperadmin(usuarioActual) &&
        !usuarioActual.permisos.includes('DESCUENTOS_APLICAR')
      )
        throw new ForbiddenException(
          'No tienes permiso para aplicar descuentos',
        );
      if (descuentos.gt(venta.subtotal))
        throw new BadRequestException(
          'El descuento no puede superar el subtotal de la venta',
        );

      let clienteId = venta.clienteId;
      if (Object.prototype.hasOwnProperty.call(data, 'clienteId')) {
        clienteId =
          data.clienteId == null
            ? null
            : await this.resolverClienteId(
                tx,
                data.clienteId,
                venta.sucursalId,
              );
      }

      const total = venta.subtotal
        .minus(descuentos)
        .plus(venta.impuestos)
        .plus(venta.impoconsumo)
        .plus(propina)
        .plus(venta.domicilioCosto);

      await tx.venta.update({
        where: { id: venta.id },
        data: { descuentos, propina, total, clienteId },
      });
      return tx.venta.findUniqueOrThrow({
        where: { id: venta.id },
        include: {
          detalles: { include: { producto: true } },
          pagos: { include: { metodoPago: true, devoluciones: true } },
          factura: { include: { documentoElectronico: true } },
          pedido: { include: { mesa: true } },
          cliente: true,
          divisionesCuenta: {
            include: { pagos: true },
            orderBy: { id: 'asc' },
          },
          aplicacionesDescuento: true,
        },
      });
    });
  }

  async dividirCuenta(
    ventaId: number,
    data: DividirCuentaDto,
    usuarioActual: UsuarioAutenticado,
  ) {
    return this.prisma.transaccionSerializable(async (tx) => {
      const venta = await tx.venta.findFirst({
        where: { id: ventaId, sucursal: this.filtroSucursal(usuarioActual) },
        include: { pagos: true, divisionesCuenta: true },
      });
      if (!venta) throw new NotFoundException('Venta no encontrada');
      if (venta.estado === EstadoVenta.ANULADA)
        throw new BadRequestException('No se puede dividir una venta anulada');
      if (venta.pagos.length > 0)
        throw new BadRequestException(
          'La cuenta debe dividirse antes de registrar pagos',
        );
      const nombres = data.partes.map((parte) =>
        parte.nombre.trim().toLowerCase(),
      );
      if (new Set(nombres).size !== nombres.length)
        throw new BadRequestException(
          'Cada parte de la cuenta debe tener un nombre diferente',
        );
      const totalPartes = data.partes.reduce(
        (total, parte) => total.plus(dinero(parte.total, 'total de parte')),
        new Prisma.Decimal(0),
      );
      if (!totalPartes.eq(venta.total))
        throw new BadRequestException(
          'La suma de las partes debe coincidir exactamente con el total de la venta',
        );
      await tx.divisionCuenta.deleteMany({ where: { ventaId } });
      await tx.divisionCuenta.createMany({
        data: data.partes.map((parte) => ({
          ventaId,
          nombre: parte.nombre.trim(),
          modo: data.modo,
          total: dinero(parte.total, 'total de parte'),
          detalles:
            parte.detalles === undefined
              ? Prisma.JsonNull
              : (parte.detalles as Prisma.InputJsonValue),
        })),
      });
      return tx.divisionCuenta.findMany({
        where: { ventaId },
        include: { pagos: true },
        orderBy: { id: 'asc' },
      });
    });
  }

  async registrarPago(
    ventaId: number,
    data: RegistrarPagoDto,
    usuarioActual: UsuarioAutenticado,
    claveRecibida: string | undefined,
  ) {
    const clave = normalizarClaveIdempotencia(claveRecibida);
    const solicitudHash = hashSolicitud({ ventaId, data });
    const ventaResultadoId = await this.prisma.transaccionSerializable(
      async (tx) => {
        const ventaAlcanzable = await tx.venta.findFirst({
          where: {
            id: ventaId,

            sucursal: this.filtroSucursal(usuarioActual),
          },

          select: { id: true },
        });

        if (!ventaAlcanzable) {
          throw new NotFoundException('Venta no encontrada');
        }

        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "Venta" WHERE "id" = ${ventaAlcanzable.id} FOR UPDATE`,
        );

        const venta = await tx.venta.findUniqueOrThrow({
          where: { id: ventaAlcanzable.id },
        });

        const pagos = await tx.pago.findMany({ where: { ventaId: venta.id } });
        const pedido = venta.pedidoId
          ? await tx.pedido.findUnique({
              where: { id: venta.pedidoId },
              select: { id: true, mesaId: true, estado: true },
            })
          : null;

        const pagoReplay = pagos.find(
          (pago) => pago.idempotenciaClave === clave,
        );
        if (pagoReplay) {
          validarReplayIdempotente(pagoReplay.idempotenciaHash, solicitudHash);
          return venta.id;
        }

        if (venta.estado === EstadoVenta.ANULADA) {
          throw new BadRequestException(
            'No se pueden registrar pagos sobre una venta anulada',
          );
        }

        if (venta.estado === EstadoVenta.PAGADA) {
          throw new BadRequestException(
            'La venta ya está pagada completamente',
          );
        }

        const metodoPago = await tx.metodoPago.findFirst({
          where: {
            id: data.metodoPagoId,
            activo: true,
          },
        });

        if (!metodoPago) {
          throw new BadRequestException(
            'El método de pago no existe o está inactivo',
          );
        }

        const divisiones = await tx.divisionCuenta.findMany({
          where: { ventaId: venta.id },
          include: { pagos: true },
        });
        if (divisiones.length > 0 && data.divisionCuentaId === undefined) {
          throw new BadRequestException(
            'Esta venta tiene la cuenta dividida; selecciona la parte que estás cobrando',
          );
        }
        if (data.divisionCuentaId !== undefined) {
          const parte = divisiones.find(
            (item) => item.id === data.divisionCuentaId,
          );
          if (!parte)
            throw new BadRequestException(
              'La parte seleccionada no pertenece a esta venta',
            );
          const pagadoParte = parte.pagos.reduce(
            (total, pago) => total.plus(pago.monto),
            new Prisma.Decimal(0),
          );
          if (pagadoParte.plus(dinero(data.monto, 'monto')).gt(parte.total))
            throw new BadRequestException(
              'El pago supera el saldo de la parte seleccionada',
            );
        }

        /*
         * =================================================
         * RESOLUCIÓN DE CAJA
         * =================================================
         *
         * Todo pago nuevo debe pertenecer a una caja
         * ABIERTA de la misma sucursal de la Venta.
         *
         * - Si el cliente envía cajaId, se valida.
         * - Si existe una sola caja abierta, se infiere.
         * - Si existen varias, cajaId es obligatorio.
         * - Si no existe ninguna, el cobro se bloquea.
         *
         * Esto evita mezclar recaudos cuando MULTICAJA
         * está habilitado.
         */
        const cajasAbiertas = await tx.caja.findMany({
          where: {
            sucursalId: venta.sucursalId,
            estado: EstadoCaja.ABIERTA,
          },
          select: {
            id: true,
            nombre: true,
          },
          orderBy: {
            id: 'asc',
          },
        });

        if (cajasAbiertas.length === 0) {
          throw new BadRequestException(
            'Debe existir una caja abierta en la sucursal para registrar el pago',
          );
        }

        let cajaId: number;

        if (data.cajaId !== undefined) {
          const cajaSolicitada = cajasAbiertas.find(
            (caja) => caja.id === data.cajaId,
          );

          if (!cajaSolicitada) {
            throw new BadRequestException(
              'La caja seleccionada no existe, está cerrada o no pertenece a la sucursal de la venta',
            );
          }

          cajaId = cajaSolicitada.id;
        } else if (cajasAbiertas.length === 1) {
          cajaId = cajasAbiertas[0].id;
        } else {
          throw new BadRequestException(
            'Hay varias cajas abiertas. Debes indicar cajaId para registrar el pago',
          );
        }

        /*
         * Bloqueo de fila para coordinar cobro y cierre.
         * Si otra transacción está cerrando la caja,
         * esperamos y luego volvemos a verificar su estado.
         */
        await tx.$queryRaw(
          Prisma.sql`
            SELECT "id"
            FROM "Caja"
            WHERE "id" = ${cajaId}
            FOR UPDATE
          `,
        );

        const caja = await tx.caja.findFirst({
          where: {
            id: cajaId,
            sucursalId: venta.sucursalId,
            estado: EstadoCaja.ABIERTA,
          },
        });

        if (!caja) {
          throw new BadRequestException(
            'La caja seleccionada ya no se encuentra abierta',
          );
        }

        const pagadoActual = pagos.reduce(
          (total, pago) => total.plus(pago.monto),

          new Prisma.Decimal(0),
        );

        const nuevoPago = dinero(data.monto, 'monto');

        const nuevoTotalPagado = pagadoActual.plus(nuevoPago);

        if (nuevoTotalPagado.gt(venta.total)) {
          throw new BadRequestException(
            'El pago supera el saldo pendiente de la venta',
          );
        }

        await tx.pago.create({
          data: {
            ventaId: venta.id,

            metodoPagoId: data.metodoPagoId,

            monto: nuevoPago,

            referencia: data.referencia?.trim() || null,

            cajaId: caja.id,

            usuarioId: usuarioActual.id,
            divisionCuentaId: data.divisionCuentaId,
            idempotenciaClave: clave,
            idempotenciaHash: solicitudHash,
          },
        });

        if (nuevoTotalPagado.eq(venta.total)) {
          await tx.venta.update({
            where: {
              id: venta.id,
            },

            data: {
              estado: EstadoVenta.PAGADA,
            },
          });
          await this.acreditarPuntos(tx, {
            ...venta,
            estado: EstadoVenta.PAGADA,
          });

          if (pedido) {
            await tx.eventoOperacional.create({
              data: {
                tipo: TipoEventoOperacional.PAGO_COMPLETADO,
                sucursalId: venta.sucursalId,
                pedidoId: pedido.id,
                ventaId: venta.id,
                actorId: usuarioActual.id,
                metadata: { total: venta.total.toString() },
              },
            });
          }

          /*
           * Si la venta proviene de un pedido
           * asociado a una mesa, completar
           * el pago libera la mesa.
           */
          if (
            pedido?.mesaId !== null &&
            pedido?.mesaId !== undefined &&
            pedido.estado === EstadoPedido.ENTREGADO
          ) {
            await tx.mesa.updateMany({
              where: {
                id: pedido.mesaId,

                estado: true,

                situacion: EstadoMesa.PENDIENTE_PAGO,
              },

              data: {
                situacion: EstadoMesa.LIBRE,
                ocupacionManual: false,
                ocupadaManualEn: null,
                ocupadaManualPorId: null,
              },
            });
          }
        }

        return venta.id;
      },
    );

    return this.prisma.venta.findUniqueOrThrow({
      where: { id: ventaResultadoId },
      include: {
        detalles: true,
        pagos: {
          include: {
            metodoPago: true,
            devoluciones: true,
            caja: { select: { id: true, nombre: true, estado: true } },
          },
        },
        factura: { include: { documentoElectronico: true } },
        pedido: { include: { mesa: true } },
      },
    });
  }

  async devolverPago(
    ventaId: number,
    pagoId: number,
    data: DevolverPagoDto,
    usuarioActual: UsuarioAutenticado,
    claveRecibida: string | undefined,
  ) {
    const clave = normalizarClaveIdempotencia(claveRecibida);
    const solicitudHash = hashSolicitud({ ventaId, pagoId, data });

    let devolucionId: number;
    try {
      devolucionId = await this.prisma.transaccionSerializable(async (tx) => {
        const pagoAlcanzable = await tx.pago.findFirst({
          where: {
            id: pagoId,
            ventaId,
            venta: { sucursal: this.filtroSucursal(usuarioActual) },
          },
          select: { id: true },
        });
        if (!pagoAlcanzable) {
          throw new NotFoundException('Pago no encontrado para esta venta');
        }

        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "Pago" WHERE "id" = ${pagoId} FOR UPDATE`,
        );
        const pago = await tx.pago.findUniqueOrThrow({
          where: { id: pagoId },
          include: {
            metodoPago: true,
            devoluciones: true,
            venta: { include: { factura: true } },
          },
        });
        const replay = pago.devoluciones.find(
          (item) => item.idempotenciaClave === clave,
        );
        if (replay) {
          validarReplayIdempotente(replay.idempotenciaHash, solicitudHash);
          return replay.id;
        }
        if (pago.venta?.factura) {
          throw new BadRequestException(
            'Una venta facturada requiere nota crédito o reversión fiscal antes de devolver el pago',
          );
        }

        const monto = dinero(data.monto, 'monto');
        const yaDevuelto = pago.devoluciones.reduce(
          (total, item) => total.plus(item.monto),
          new Prisma.Decimal(0),
        );
        if (yaDevuelto.plus(monto).gt(pago.monto)) {
          throw new BadRequestException(
            'La devolución supera el saldo disponible del pago',
          );
        }

        let movimientoCajaId: number | null = null;
        if (pago.metodoPago.tipo === TipoMetodoPago.EFECTIVO) {
          if (!pago.cajaId) {
            throw new BadRequestException(
              'El pago en efectivo no tiene una caja asociada',
            );
          }
          await tx.$queryRaw(
            Prisma.sql`SELECT "id" FROM "Caja" WHERE "id" = ${pago.cajaId} FOR UPDATE`,
          );
          const caja = await tx.caja.findFirst({
            where: {
              id: pago.cajaId,
              estado: EstadoCaja.ABIERTA,
              sucursalId: pago.venta?.sucursalId,
            },
          });
          if (!caja) {
            throw new BadRequestException(
              'La devolución en efectivo requiere la caja original abierta',
            );
          }
          const movimiento = await tx.movimientoCaja.create({
            data: {
              cajaId: caja.id,
              usuarioId: usuarioActual.id,
              tipo: TipoMovimientoCaja.EGRESO,
              monto,
              concepto: `Devolución pago #${pago.id}`,
              observacion: data.motivo.trim(),
              idempotenciaClave: `dev:${clave}`,
              idempotenciaHash: solicitudHash,
            },
          });
          movimientoCajaId = movimiento.id;
        }

        const devolucion = await tx.devolucionPago.create({
          data: {
            pagoId,
            usuarioId: usuarioActual.id,
            monto,
            motivo: data.motivo.trim(),
            idempotenciaClave: clave,
            idempotenciaHash: solicitudHash,
            movimientoCajaId,
          },
        });
        return devolucion.id;
      });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      )
        throw error;
      const replay = await this.prisma.devolucionPago.findUnique({
        where: {
          pagoId_idempotenciaClave: { pagoId, idempotenciaClave: clave },
        },
      });
      if (!replay) throw error;
      validarReplayIdempotente(replay.idempotenciaHash, solicitudHash);
      devolucionId = replay.id;
    }

    return this.prisma.devolucionPago.findUniqueOrThrow({
      where: { id: devolucionId },
      include: {
        pago: { include: { metodoPago: true } },
        movimientoCaja: true,
      },
    });
  }

  async reversar(
    id: number,
    data: ReversarVentaDto,
    usuarioActual: UsuarioAutenticado,
    claveRecibida: string | undefined,
  ) {
    const clave = normalizarClaveIdempotencia(claveRecibida);
    const solicitudHash = hashSolicitud({ ventaId: id, data });

    let ventaId: number;
    try {
      ventaId = await this.prisma.transaccionSerializable(async (tx) => {
        const ventaAlcanzable = await tx.venta.findFirst({
          where: { id, sucursal: this.filtroSucursal(usuarioActual) },
          select: { id: true },
        });
        if (!ventaAlcanzable)
          throw new NotFoundException('Venta no encontrada');
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "Venta" WHERE "id" = ${id} FOR UPDATE`,
        );
        const venta = await tx.venta.findUniqueOrThrow({
          where: { id },
          include: {
            factura: true,
            reversion: true,
            pagos: { include: { devoluciones: true } },
          },
        });
        if (venta.reversion) {
          validarReplayIdempotente(
            venta.reversion.idempotenciaHash,
            solicitudHash,
          );
          return venta.id;
        }
        if (venta.factura) {
          throw new BadRequestException(
            'Una venta facturada requiere nota crédito o reversión fiscal',
          );
        }
        const saldoNoDevuelto = venta.pagos.reduce((total, pago) => {
          const devuelto = pago.devoluciones.reduce(
            (subtotal, item) => subtotal.plus(item.monto),
            new Prisma.Decimal(0),
          );
          return total.plus(pago.monto.minus(devuelto));
        }, new Prisma.Decimal(0));
        if (!saldoNoDevuelto.isZero()) {
          throw new BadRequestException(
            'Debes devolver completamente todos los pagos antes de reversar la venta',
          );
        }
        await this.inventarioService.revertirPorAnulacionVenta(tx, {
          ventaId: venta.id,
          sucursalId: venta.sucursalId,
          usuarioActual,
        });
        await this.revertirPuntos(tx, venta.id);
        await tx.reversionVenta.create({
          data: {
            ventaId: venta.id,
            usuarioId: usuarioActual.id,
            motivo: data.motivo.trim(),
            idempotenciaClave: clave,
            idempotenciaHash: solicitudHash,
          },
        });
        await tx.venta.update({
          where: { id: venta.id },
          data: { estado: EstadoVenta.ANULADA },
        });
        return venta.id;
      });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      )
        throw error;
      const replay = await this.prisma.reversionVenta.findUnique({
        where: { ventaId: id },
      });
      if (!replay) throw error;
      validarReplayIdempotente(replay.idempotenciaHash, solicitudHash);
      ventaId = id;
    }

    return this.prisma.venta.findUniqueOrThrow({
      where: { id: ventaId },
      include: {
        detalles: true,
        pagos: { include: { devoluciones: true } },
        reversion: true,
      },
    });
  }

  async anular(id: number, usuarioActual: UsuarioAutenticado) {
    const ventaId = await this.prisma.transaccionSerializable(async (tx) => {
      const venta = await tx.venta.findFirst({
        where: {
          id,

          sucursal: this.filtroSucursal(usuarioActual),
        },
      });

      if (!venta) {
        throw new NotFoundException('Venta no encontrada');
      }

      if (venta.estado === EstadoVenta.ANULADA) {
        throw new BadRequestException('La venta ya esta anulada');
      }

      /*
       * Una factura emitida implica que la
       * operación ya posee un documento comercial.
       *
       * No se permite cambiar simplemente Venta
       * a ANULADA porque eso requiere un flujo
       * formal de reversión de facturación.
       */
      const factura = await tx.factura.findUnique({
        where: { ventaId: venta.id },
        select: { id: true },
      });

      if (factura) {
        throw new BadRequestException(
          'Una venta facturada requiere un flujo de reversión de facturación',
        );
      }

      /*
       * Cualquier dinero registrado impide
       * la anulación directa.
       *
       * El movimiento deberá resolverse mediante
       * devolución/reversión cuando dicho flujo
       * sea implementado.
       */
      const cantidadPagos = await tx.pago.count({
        where: { ventaId: venta.id },
      });

      if (cantidadPagos > 0) {
        throw new BadRequestException(
          'Una venta con pagos registrados requiere un flujo de devolución',
        );
      }

      /*
       * Incluso una Venta PAGADA sin registros
       * de Pago puede existir cuando su total
       * es cero.
       *
       * PAGADA es un estado comercial cerrado
       * y no debe pasar directamente a ANULADA.
       */
      if (venta.estado === EstadoVenta.PAGADA) {
        throw new BadRequestException(
          'Una venta pagada requiere un flujo de reversión comercial',
        );
      }

      /*
       * Las ventas originadas desde Pedido tienen
       * una relación uno-a-uno con dicho Pedido.
       *
       * Anularlas y reabrir la Mesa dejaría al
       * Pedido con una Venta ANULADA asociada y
       * sin posibilidad segura de generar un
       * nuevo cobro.
       *
       * Hasta implementar el flujo formal de
       * reapertura/reversión, la anulación directa
       * de estas ventas queda bloqueada.
       *
       * No se modifica Pedido.
       * No se modifica Mesa.
       */
      if (venta.origen === OrigenVenta.PEDIDO) {
        throw new BadRequestException(
          'Una venta originada en un pedido requiere el flujo de reapertura o reversión del cobro',
        );
      }

      /*
       * Solo llegan aquí:
       *
       * DIRECTA / MANUAL_CIERRE
       * +
       * PENDIENTE_PAGO
       * +
       * sin pagos
       * +
       * sin factura
       *
       * La restauración de inventario se ejecuta ANTES
       * del cambio de estado, dentro de esta misma
       * transacción Serializable. Si falla una sola
       * restitución, la Venta permanece sin anular.
       */
      await this.inventarioService.revertirPorAnulacionVenta(tx, {
        ventaId: venta.id,
        sucursalId: venta.sucursalId,
        usuarioActual,
      });
      await this.revertirPuntos(tx, venta.id);

      const anulada = await tx.venta.update({
        where: {
          id: venta.id,
        },

        data: {
          estado: EstadoVenta.ANULADA,
        },
      });

      return anulada.id;
    });

    return this.prisma.venta.findUniqueOrThrow({
      where: { id: ventaId },
      include: {
        detalles: true,
        pagos: true,
        factura: true,
      },
    });
  }

  async comprobantePos(id: number, usuarioActual: UsuarioAutenticado) {
    const venta = await this.prisma.venta.findFirst({
      where: { id, sucursal: this.filtroSucursal(usuarioActual) },
      include: {
        sucursal: { include: { restaurante: true } },
        usuario: { select: { nombres: true, apellidos: true } },
        pedido: { include: { mesa: true } },
        detalles: { include: { producto: true } },
        pagos: { include: { metodoPago: true, devoluciones: true } },
        factura: { include: { documentoElectronico: true } },
      },
    });
    if (!venta) throw new NotFoundException('Venta no encontrada');
    if (venta.pagos.length === 0)
      throw new BadRequestException(
        'El comprobante POS requiere al menos un pago registrado',
      );
    const cfg = await configuracionImpresionTermica(
      this.prisma,
      venta.sucursal.restauranteId,
      venta.sucursalId,
    );
    const esc = escaparHtml;
    const filas = venta.detalles
      .map(
        (d) =>
          `<div class="row line"><span>${d.cantidad}× ${esc(d.producto.nombre)}</span><strong>${dineroTermico(d.subtotal, cfg.moneda)}</strong></div>`,
      )
      .join('');
    const pagos = venta.pagos
      .map((p) => {
        const devuelto = p.devoluciones.reduce(
          (sum, d) => sum + Number(d.monto),
          0,
        );
        const neto = Number(p.monto) - devuelto;
        return `<div class="row"><span>${esc(p.metodoPago.nombre)}</span><strong>${dineroTermico(neto, cfg.moneda)}</strong></div>`;
      })
      .join('');
    const totalPagado = venta.pagos.reduce(
      (sum, p) =>
        sum +
        Number(p.monto) -
        p.devoluciones.reduce((r, d) => r + Number(d.monto), 0),
      0,
    );
    const pendiente = Math.max(0, Number(venta.total) - totalPagado);
    const factura = venta.factura
      ? `<div class="row"><span>Factura interna</span><strong>${esc(venta.factura.numero)}</strong></div>`
      : '';
    const fiscal =
      venta.factura?.documentoElectronico?.estado === 'ACEPTADO'
        ? `<div class="center muted">Documento electrónico aceptado: ${esc(venta.factura.documentoElectronico.numeroCompleto)}</div>`
        : `<div class="center muted">Comprobante interno de pago. No equivale por sí solo a documento electrónico aceptado por DIAN.</div>`;
    const cuerpo = `<div class="center"><div class="title">COMPROBANTE INTERNO POS</div><p>${esc(venta.sucursal.restaurante.nombre)}<br>NIT ${esc(venta.sucursal.restaurante.nit)}<br>${esc(venta.sucursal.nombre)}</p></div><hr class="sep"><div class="row"><span>Venta</span><strong>#${venta.id}</strong></div>${venta.pedido?.mesa ? `<div class="row"><span>Mesa</span><strong>${esc(venta.pedido.mesa.numero)}</strong></div>` : ''}<div class="row"><span>Fecha</span><strong>${esc(fechaLocalTermica(venta.fechaOperacion, cfg.zonaHoraria))}</strong></div><div class="row"><span>Cajero</span><strong>${esc(`${venta.usuario.nombres} ${venta.usuario.apellidos}`.trim())}</strong></div>${factura}<hr class="sep">${filas}<hr class="sep"><div class="row"><span>Subtotal</span><span>${dineroTermico(venta.subtotal, cfg.moneda)}</span></div>${Number(venta.descuentos) ? `<div class="row"><span>Descuentos</span><span>-${dineroTermico(venta.descuentos, cfg.moneda)}</span></div>` : ''}${Number(venta.impuestos) ? `<div class="row"><span>Impuestos</span><span>${dineroTermico(venta.impuestos, cfg.moneda)}</span></div>` : ''}${Number(venta.impoconsumo) ? `<div class="row"><span>Impoconsumo</span><span>${dineroTermico(venta.impoconsumo, cfg.moneda)}</span></div>` : ''}${Number(venta.domicilioCosto) ? `<div class="row"><span>Domicilio</span><span>${dineroTermico(venta.domicilioCosto, cfg.moneda)}</span></div>` : ''}${Number(venta.propina) ? `<div class="row"><span>Propina</span><span>${dineroTermico(venta.propina, cfg.moneda)}</span></div>` : ''}<div class="row total"><span>TOTAL</span><span>${dineroTermico(venta.total, cfg.moneda)}</span></div><hr class="sep"><div class="strong">PAGOS</div>${pagos}<div class="row"><span>Total aplicado</span><strong>${dineroTermico(totalPagado, cfg.moneda)}</strong></div>${pendiente > 0 ? `<div class="row"><span>Saldo pendiente</span><strong>${dineroTermico(pendiente, cfg.moneda)}</strong></div>` : '<div class="center strong">PAGADO</div>'}<hr class="sep">${fiscal}`;
    return {
      tipo: 'COMPROBANTE_POS',
      ventaId: venta.id,
      anchoPapel: cfg.ancho,
      mediaType: 'text/html; charset=utf-8',
      contenido: documentoTermicoHtml({
        titulo: `Comprobante interno POS ${venta.id}`,
        ancho: cfg.ancho,
        cuerpo,
      }),
    };
  }
}
