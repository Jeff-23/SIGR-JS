import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
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

@Injectable()
export class VentasService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  private esSuperadmin(
    usuarioActual: UsuarioAutenticado,
  ) {
    return usuarioActual.restauranteId === null;
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
              id: usuarioActual.restauranteId!,
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

  private validarYCalcularTotales(
    subtotal: Prisma.Decimal,
    data: AjustesVentaDto,
    usuarioActual: UsuarioAutenticado,
  ) {
    const descuentos =
      new Prisma.Decimal(data.descuentos ?? 0);

    const impuestos =
      new Prisma.Decimal(data.impuestos ?? 0);

    const impoconsumo =
      new Prisma.Decimal(data.impoconsumo ?? 0);

    const propina =
      new Prisma.Decimal(data.propina ?? 0);

    if (
      descuentos.gt(0) &&
      !this.esSuperadmin(usuarioActual) &&
      !usuarioActual.permisos.includes(
        'DESCUENTOS_APLICAR',
      )
    ) {
      throw new ForbiddenException(
        'No tienes permiso para aplicar descuentos',
      );
    }

    if (descuentos.gt(subtotal)) {
      throw new BadRequestException(
        'El descuento no puede superar el subtotal de la venta',
      );
    }

    const total =
      subtotal
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
    return this.prisma.$transaction(
      async (tx) => {
        const pedido =
          await tx.pedido.findFirst({
            where: {
              id: data.pedidoId,

              sucursal:
                this.filtroSucursal(
                  usuarioActual,
                ),
            },

            include: {
              detalles: true,
              venta: true,
              factura: true,
            },
          });

        if (!pedido) {
          throw new NotFoundException(
            'Pedido no encontrado',
          );
        }

        if (pedido.venta) {
          throw new BadRequestException(
            'Este pedido ya tiene una venta asociada',
          );
        }

        if (
          pedido.factura ||
          pedido.estado ===
            EstadoPedido.FACTURADO
        ) {
          throw new BadRequestException(
            'Este pedido ya fue procesado mediante el flujo anterior de facturación',
          );
        }

        if (
          pedido.estado ===
          EstadoPedido.CANCELADO
        ) {
          throw new BadRequestException(
            'No se puede vender un pedido cancelado',
          );
        }

        const subtotal =
          pedido.detalles.reduce(
            (total, detalle) =>
              total.plus(detalle.subtotal),
            new Prisma.Decimal(0),
          );

        const ajustes =
          this.validarYCalcularTotales(
            subtotal,
            data,
            usuarioActual,
          );

        return tx.venta.create({
          data: {
            origen: OrigenVenta.PEDIDO,

            estado: ajustes.total.eq(0)
              ? EstadoVenta.PAGADA
              : EstadoVenta.PENDIENTE_PAGO,

            subtotal,
            descuentos:
              ajustes.descuentos,
            impuestos:
              ajustes.impuestos,
            impoconsumo:
              ajustes.impoconsumo,
            propina:
              ajustes.propina,
            total:
              ajustes.total,

            fechaOperacion: new Date(),

            sucursalId:
              pedido.sucursalId,

            usuarioId:
              usuarioActual.id,

            pedidoId:
              pedido.id,

            detalles: {
              create:
                pedido.detalles.map(
                  (detalle) => ({
                    productoId:
                      detalle.productoId,

                    cantidad:
                      detalle.cantidad,

                    precioUnitario:
                      detalle.precioUnitario,

                    subtotal:
                      detalle.subtotal,
                  }),
                ),
            },
          },

          include: {
            detalles: true,
            pagos: true,
            factura: true,
          },
        });
      },
    );
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

    hoy.setHours(
      0,
      0,
      0,
      0,
    );

    const inicio =
      fechaInicio
        ? new Date(fechaInicio)
        : hoy;

    const fin =
      fechaFin
        ? new Date(fechaFin)
        : new Date();

    if (
      Number.isNaN(
        inicio.getTime(),
      ) ||
      Number.isNaN(
        fin.getTime(),
      )
    ) {
      throw new BadRequestException(
        'Las fechas indicadas no son válidas',
      );
    }

    if (inicio > fin) {
      throw new BadRequestException(
        'La fecha inicial no puede ser posterior a la fecha final',
      );
    }

    const ventas =
      await this.prisma.venta.findMany({
        where: {
          /*
           * REGLA PRINCIPAL:
           *
           * La fecha comercial es fechaOperacion,
           * NO creadoEn y NO Factura.creadoEn.
           */
          fechaOperacion: {
            gte: inicio,
            lte: fin,
          },

          /*
           * Una venta anulada no forma parte
           * del total comercial.
           */
          estado: {
            not: EstadoVenta.ANULADA,
          },

          /*
           * Aislamiento multiempresa/multisucursal.
           */
          sucursal:
            this.filtroSucursal(
              usuarioActual,
            ),
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

    let totalVentas =
      new Prisma.Decimal(0);

    let totalPagado =
      new Prisma.Decimal(0);

    const desglosePagosDecimal:
      Record<
        string,
        Prisma.Decimal
      > = {};

    const desgloseOrigenDecimal:
      Record<
        string,
        Prisma.Decimal
      > = {};

    const ventasPorEstado:
      Record<string, number> = {};

    for (
      const venta of ventas
    ) {
      totalVentas =
        totalVentas.add(
          venta.total,
        );

      /*
       * Agrupar ventas por origen.
       *
       * PEDIDO
       * DIRECTA
       * MANUAL_CIERRE
       */
      if (
        !desgloseOrigenDecimal[
          venta.origen
        ]
      ) {
        desgloseOrigenDecimal[
          venta.origen
        ] = new Prisma.Decimal(0);
      }

      desgloseOrigenDecimal[
        venta.origen
      ] =
        desgloseOrigenDecimal[
          venta.origen
        ].add(
          venta.total,
        );

      /*
       * Cantidad de ventas por estado.
       */
      if (
        !ventasPorEstado[
          venta.estado
        ]
      ) {
        ventasPorEstado[
          venta.estado
        ] = 0;
      }

      ventasPorEstado[
        venta.estado
      ] += 1;

      /*
       * Pagos asociados a las ventas
       * comerciales seleccionadas.
       */
      for (
        const pago of venta.pagos
      ) {
        totalPagado =
          totalPagado.add(
            pago.monto,
          );

        const metodo =
          pago.metodoPago.nombre;

        if (
          !desglosePagosDecimal[
            metodo
          ]
        ) {
          desglosePagosDecimal[
            metodo
          ] =
            new Prisma.Decimal(0);
        }

        desglosePagosDecimal[
          metodo
        ] =
          desglosePagosDecimal[
            metodo
          ].add(
            pago.monto,
          );
      }
    }

    const totalPendiente =
      totalVentas.sub(
        totalPagado,
      );

    /*
     * Convertir Decimal únicamente
     * al preparar la respuesta HTTP.
     */
    const desglosePagos:
      Record<string, number> = {};

    for (
      const [
        metodo,
        monto,
      ] of Object.entries(
        desglosePagosDecimal,
      )
    ) {
      desglosePagos[
        metodo
      ] = monto.toNumber();
    }

    const desgloseOrigen:
      Record<string, number> = {};

    for (
      const [
        origen,
        monto,
      ] of Object.entries(
        desgloseOrigenDecimal,
      )
    ) {
      desgloseOrigen[
        origen
      ] = monto.toNumber();
    }

    return {
      fechaInicio:
        inicio,

      fechaFin:
        fin,

      cantidadVentas:
        ventas.length,

      totalVentas:
        totalVentas.toNumber(),

      totalPagado:
        totalPagado.toNumber(),

      totalPendiente:
        totalPendiente.toNumber(),

      desglosePagos,

      desgloseOrigen,

      ventasPorEstado,
    };
  }

  private async crearSinPedido(
    data:
      | CrearVentaDirectaDto
      | CrearVentaManualDto,

    origen: OrigenVenta,

    usuarioActual: UsuarioAutenticado,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const sucursal =
          await tx.sucursal.findFirst({
            where: {
              AND: [
                {
                  id: data.sucursalId,
                },

                this.filtroSucursal(
                  usuarioActual,
                ),
              ],
            },
          });

        if (!sucursal) {
          throw new NotFoundException(
            'Sucursal no encontrada',
          );
        }

        let fechaOperacion =
          new Date();

        if (
          origen ===
          OrigenVenta.MANUAL_CIERRE
        ) {
          fechaOperacion =
            new Date(
              (
                data as CrearVentaManualDto
              ).fechaOperacion,
            );

          if (
            Number.isNaN(
              fechaOperacion.getTime(),
            )
          ) {
            throw new BadRequestException(
              'La fecha de operación no es válida',
            );
          }

          if (
            fechaOperacion.getTime() >
            Date.now()
          ) {
            throw new BadRequestException(
              'La fecha de operación no puede estar en el futuro',
            );
          }
        }

        /*
         * Agrupar productos repetidos.
         *
         * Evita guardar varias líneas del
         * mismo producto accidentalmente.
         */
        const cantidades =
          new Map<number, number>();

        for (const detalle of data.detalles) {
          cantidades.set(
            detalle.productoId,
            (cantidades.get(
              detalle.productoId,
            ) ?? 0) +
              detalle.cantidad,
          );
        }

        const idsProductos = [
          ...cantidades.keys(),
        ];

        const productos =
          await tx.producto.findMany({
            where: {
              id: {
                in: idsProductos,
              },

              estado: true,

              categoria: {
                estado: true,
                sucursalId:
                  sucursal.id,
              },
            },
          });

        if (
          productos.length !==
          idsProductos.length
        ) {
          throw new NotFoundException(
            'Uno o más productos no existen o no pertenecen a la sucursal',
          );
        }

        const productosPorId =
          new Map(
            productos.map(
              (producto) => [
                producto.id,
                producto,
              ],
            ),
          );

        let subtotal =
          new Prisma.Decimal(0);

        const detallesPreparados: {
          productoId: number;
          cantidad: number;
          precioUnitario: Prisma.Decimal;
          subtotal: Prisma.Decimal;
        }[] = [];

        for (
          const [
            productoId,
            cantidad,
          ] of cantidades
        ) {
          const producto =
            productosPorId.get(
              productoId,
            )!;

          const subtotalDetalle =
            producto.precio.mul(
              cantidad,
            );

          subtotal =
            subtotal.plus(
              subtotalDetalle,
            );

          detallesPreparados.push({
            productoId,
            cantidad,

            precioUnitario:
              producto.precio,

            subtotal:
              subtotalDetalle,
          });
        }

        const ajustes =
          this.validarYCalcularTotales(
            subtotal,
            data,
            usuarioActual,
          );

        return tx.venta.create({
          data: {
            origen,

            estado: ajustes.total.eq(0)
              ? EstadoVenta.PAGADA
              : EstadoVenta.PENDIENTE_PAGO,

            subtotal,
            descuentos:
              ajustes.descuentos,
            impuestos:
              ajustes.impuestos,
            impoconsumo:
              ajustes.impoconsumo,
            propina:
              ajustes.propina,
            total:
              ajustes.total,

            fechaOperacion,

            sucursalId:
              sucursal.id,

            usuarioId:
              usuarioActual.id,

            detalles: {
              create:
                detallesPreparados,
            },
          },

          include: {
            detalles: true,
            pagos: true,
            factura: true,
          },
        });
      },
    );
  }

  crearDirecta(
    data: CrearVentaDirectaDto,
    usuarioActual: UsuarioAutenticado,
  ) {
    return this.crearSinPedido(
      data,
      OrigenVenta.DIRECTA,
      usuarioActual,
    );
  }

  crearManual(
    data: CrearVentaManualDto,
    usuarioActual: UsuarioAutenticado,
  ) {
    return this.crearSinPedido(
      data,
      OrigenVenta.MANUAL_CIERRE,
      usuarioActual,
    );
  }

  findAll(
    usuarioActual: UsuarioAutenticado,
  ) {
    return this.prisma.venta.findMany({
      where: {
        sucursal:
          this.filtroSucursal(
            usuarioActual,
          ),
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
      },

      orderBy: {
        fechaOperacion: 'desc',
      },
    });
  }

  async findOne(
    id: number,
    usuarioActual: UsuarioAutenticado,
  ) {
    const venta =
      await this.prisma.venta.findFirst({
        where: {
          id,

          sucursal:
            this.filtroSucursal(
              usuarioActual,
            ),
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
        },
      });

    if (!venta) {
      throw new NotFoundException(
        'Venta no encontrada',
      );
    }

    return venta;
  }

  async registrarPago(
    ventaId: number,
    data: RegistrarPagoDto,
    usuarioActual: UsuarioAutenticado,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const venta =
          await tx.venta.findFirst({
            where: {
              id: ventaId,

              sucursal:
                this.filtroSucursal(
                  usuarioActual,
                ),
            },

            include: {
              pagos: true,
            },
          });

        if (!venta) {
          throw new NotFoundException(
            'Venta no encontrada',
          );
        }

        if (
          venta.estado ===
          EstadoVenta.ANULADA
        ) {
          throw new BadRequestException(
            'No se pueden registrar pagos sobre una venta anulada',
          );
        }

        if (
          venta.estado ===
          EstadoVenta.PAGADA
        ) {
          throw new BadRequestException(
            'La venta ya está pagada completamente',
          );
        }

        const metodoPago =
          await tx.metodoPago.findFirst({
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

        const pagadoActual =
          venta.pagos.reduce(
            (total, pago) =>
              total.plus(pago.monto),

            new Prisma.Decimal(0),
          );

        const nuevoPago =
          new Prisma.Decimal(
            data.monto,
          );

        const nuevoTotalPagado =
          pagadoActual.plus(
            nuevoPago,
          );

        if (
          nuevoTotalPagado.gt(
            venta.total,
          )
        ) {
          throw new BadRequestException(
            'El pago supera el saldo pendiente de la venta',
          );
        }

        await tx.pago.create({
          data: {
            ventaId:
              venta.id,

            metodoPagoId:
              data.metodoPagoId,

            monto:
              nuevoPago,

            referencia:
              data.referencia
                ?.trim() || null,
          },
        });

        if (
          nuevoTotalPagado.eq(
            venta.total,
          )
        ) {
          await tx.venta.update({
            where: {
              id: venta.id,
            },

            data: {
              estado:
                EstadoVenta.PAGADA,
            },
          });
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
              },
            },

            factura: true,
          },
        });
      },

      {
        isolationLevel:
          Prisma.TransactionIsolationLevel
            .Serializable,
      },
    );
  }

  async anular(
    id: number,
    usuarioActual: UsuarioAutenticado,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const venta =
          await tx.venta.findFirst({
            where: {
              id,

              sucursal:
                this.filtroSucursal(
                  usuarioActual,
                ),
            },

            include: {
              pagos: true,
              factura: true,
            },
          });

        if (!venta) {
          throw new NotFoundException(
            'Venta no encontrada',
          );
        }

        if (
          venta.estado ===
          EstadoVenta.ANULADA
        ) {
          throw new BadRequestException(
            'La venta ya está anulada',
          );
        }

        if (venta.factura) {
          throw new BadRequestException(
            'Una venta facturada debe anularse mediante el flujo de facturación',
          );
        }

        if (venta.pagos.length > 0) {
          throw new BadRequestException(
            'Una venta con pagos registrados requiere un flujo de devolución',
          );
        }

        return tx.venta.update({
          where: {
            id: venta.id,
          },

          data: {
            estado:
              EstadoVenta.ANULADA,
          },
        });
      },
    );
  }
}