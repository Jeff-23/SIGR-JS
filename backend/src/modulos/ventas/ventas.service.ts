import {
  BadRequestException,
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
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

import {
  AjustesVentaDto,
  CrearVentaDirectaDto,
  CrearVentaManualDto,
  CrearVentaPedidoDto,
} from './dto/crear-venta.dto';

import { RegistrarPagoDto } from './dto/registrar-pago.dto';

import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';
import { InventarioService } from '../inventario/inventario.service';

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

  private validarYCalcularTotales(
    subtotal: Prisma.Decimal,
    data: AjustesVentaDto,
    usuarioActual: UsuarioAutenticado,
  ) {
    const descuentos = new Prisma.Decimal(data.descuentos ?? 0);

    const impuestos = new Prisma.Decimal(data.impuestos ?? 0);

    const impoconsumo = new Prisma.Decimal(data.impoconsumo ?? 0);

    const propina = new Prisma.Decimal(data.propina ?? 0);

    if (
      descuentos.gt(0) &&
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

  async crearDesdePedido(
    data: CrearVentaPedidoDto,
    usuarioActual: UsuarioAutenticado,
  ) {
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
        },
      });

      if (!pedido) {
        throw new NotFoundException('Pedido no encontrado');
      }

      if (pedido.venta) {
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

      const ajustes = this.validarYCalcularTotales(
        subtotal,
        data,
        usuarioActual,
      );

      const ventaBase = await tx.venta.create({
        data: {
          origen: OrigenVenta.PEDIDO,

          estado: ajustes.total.eq(0)
            ? EstadoVenta.PAGADA
            : EstadoVenta.PENDIENTE_PAGO,

          subtotal,

          descuentos: ajustes.descuentos,

          impuestos: ajustes.impuestos,

          impoconsumo: ajustes.impoconsumo,

          propina: ajustes.propina,

          total: ajustes.total,

          fechaOperacion: new Date(),

          sucursalId: pedido.sucursalId,

          usuarioId: usuarioActual.id,

          pedidoId: pedido.id,

          clienteId,
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
              ventaBase.estado === EstadoVenta.PAGADA
                ? EstadoMesa.LIBRE
                : EstadoMesa.PENDIENTE_PAGO,
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
        factura: true,
        cliente: true,
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
  ) {
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

      const clienteId = await this.resolverClienteId(
        tx,
        data.clienteId,
        sucursal.id,
      );

      let fechaOperacion = new Date();

      if (origen === OrigenVenta.MANUAL_CIERRE) {
        fechaOperacion = new Date((data as CrearVentaManualDto).fechaOperacion);

        if (Number.isNaN(fechaOperacion.getTime())) {
          throw new BadRequestException('La fecha de operación no es válida');
        }

        if (fechaOperacion.getTime() > Date.now()) {
          throw new BadRequestException(
            'La fecha de operación no puede estar en el futuro',
          );
        }
      }

      const cantidades = new Map<number, number>();

      for (const detalle of data.detalles) {
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

        const subtotalDetalle = producto.precio.mul(cantidad);

        subtotal = subtotal.plus(subtotalDetalle);

        detallesPreparados.push({
          productoId,
          cantidad,

          precioUnitario: producto.precio,

          subtotal: subtotalDetalle,
        });
      }

      const ajustes = this.validarYCalcularTotales(
        subtotal,
        data,
        usuarioActual,
      );

      const ventaBase = await tx.venta.create({
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

          sucursalId: sucursal.id,

          usuarioId: usuarioActual.id,

          clienteId,
        },
      });

      await tx.detalleVenta.createMany({
        data: detallesPreparados.map((detalle) => ({
          ventaId: ventaBase.id,
          productoId: detalle.productoId,
          cantidad: detalle.cantidad,
          precioUnitario: detalle.precioUnitario,
          subtotal: detalle.subtotal,
        })),
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
        factura: true,
        cliente: true,
      },
    });
  }

  crearDirecta(data: CrearVentaDirectaDto, usuarioActual: UsuarioAutenticado) {
    return this.crearSinPedido(data, OrigenVenta.DIRECTA, usuarioActual);
  }

  crearManual(data: CrearVentaManualDto, usuarioActual: UsuarioAutenticado) {
    return this.crearSinPedido(data, OrigenVenta.MANUAL_CIERRE, usuarioActual);
  }

  findAll(usuarioActual: UsuarioAutenticado) {
    return this.prisma.venta.findMany({
      where: {
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
          },
        },

        factura: true,
        cliente: true,
      },

      orderBy: {
        fechaOperacion: 'desc',
      },
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
          },
        },

        factura: true,
        pedido: true,
        cliente: true,
      },
    });

    if (!venta) {
      throw new NotFoundException('Venta no encontrada');
    }

    return venta;
  }

  async registrarPago(
    ventaId: number,
    data: RegistrarPagoDto,
    usuarioActual: UsuarioAutenticado,
  ) {
    return this.prisma.transaccionSerializable(async (tx) => {
      const venta = await tx.venta.findFirst({
        where: {
          id: ventaId,

          sucursal: this.filtroSucursal(usuarioActual),
        },

        include: {
          pagos: true,

          pedido: {
            select: {
              id: true,
              mesaId: true,
            },
          },
        },
      });

      if (!venta) {
        throw new NotFoundException('Venta no encontrada');
      }

      if (venta.estado === EstadoVenta.ANULADA) {
        throw new BadRequestException(
          'No se pueden registrar pagos sobre una venta anulada',
        );
      }

      if (venta.estado === EstadoVenta.PAGADA) {
        throw new BadRequestException('La venta ya está pagada completamente');
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

      const pagadoActual = venta.pagos.reduce(
        (total, pago) => total.plus(pago.monto),

        new Prisma.Decimal(0),
      );

      const nuevoPago = new Prisma.Decimal(data.monto);

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

        /*
         * Si la venta proviene de un pedido
         * asociado a una mesa, completar
         * el pago libera la mesa.
         */
        if (
          venta.pedido?.mesaId !== null &&
          venta.pedido?.mesaId !== undefined
        ) {
          await tx.mesa.updateMany({
            where: {
              id: venta.pedido.mesaId,

              estado: true,

              situacion: EstadoMesa.PENDIENTE_PAGO,
            },

            data: {
              situacion: EstadoMesa.LIBRE,
            },
          });
        }
      }

      return tx.venta.findUnique({
        where: {
          id: venta.id,
        },

        include: {
          detalles: true,

          pagos: {
            include: {
              metodoPago: true,
              caja: {
                select: {
                  id: true,
                  nombre: true,
                  estado: true,
                },
              },
            },
          },

          factura: true,

          pedido: true,
        },
      });
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
}
