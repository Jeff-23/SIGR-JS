import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  EstadoMesa,
  EstadoPedido,
  EstadoVenta,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { CreateFacturaDto } from './dto/create-factura.dto';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';

@Injectable()
export class FacturasService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  private esSuperadmin(
    usuarioActual: UsuarioAutenticado,
  ) {
    return usuarioActual.restauranteId === null;
  }

  /*
   * Filtro centralizado de sucursal.
   *
   * Garantiza aislamiento:
   * Restaurante -> Sucursal.
   */
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

  /*
   * Permite localizar tanto:
   *
   * LEGACY:
   * Pedido -> Factura
   *
   * NUEVO:
   * Venta -> Factura
   *
   * sin romper aislamiento multiempresa.
   */
  private filtroFacturaTenant(
    usuarioActual: UsuarioAutenticado,
  ): Prisma.FacturaWhereInput {
    const sucursal =
      this.filtroSucursal(usuarioActual);

    return {
      OR: [
        {
          venta: {
            is: {
              sucursal,
            },
          },
        },

        {
          pedido: {
            is: {
              sucursal,
            },
          },
        },
      ],
    };
  }

  /*
   * =====================================================
   * FLUJO LEGACY
   * Pedido -> Factura -> Pago
   *
   * Se conserva temporalmente para compatibilidad.
   * =====================================================
   */
  async create(
    data: CreateFacturaDto,
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
              factura: true,
            },
          });

        if (!pedido) {
          throw new NotFoundException(
            'Pedido no encontrado',
          );
        }

        if (
          pedido.factura ||
          pedido.estado ===
            EstadoPedido.FACTURADO
        ) {
          throw new BadRequestException(
            'Este pedido ya fue facturado',
          );
        }

        if (
          pedido.estado ===
          EstadoPedido.CANCELADO
        ) {
          throw new BadRequestException(
            'No se puede facturar un pedido cancelado',
          );
        }

        /*
         * Validar métodos de pago legacy.
         */
        const idsMetodosPago = [
          ...new Set(
            data.pagos.map(
              (pago) =>
                pago.metodoPagoId,
            ),
          ),
        ];

        const metodosPagoActivos =
          await tx.metodoPago.findMany({
            where: {
              id: {
                in: idsMetodosPago,
              },

              activo: true,
            },

            select: {
              id: true,
            },
          });

        if (
          metodosPagoActivos.length !==
          idsMetodosPago.length
        ) {
          throw new BadRequestException(
            'Uno o más métodos de pago no existen o están inactivos',
          );
        }

        const totalPedido =
          pedido.total.toNumber();

        const sumaPagos =
          data.pagos.reduce(
            (sum, pago) =>
              sum + pago.monto,
            0,
          );

        if (
          sumaPagos < totalPedido
        ) {
          throw new BadRequestException(
            `El monto pagado (${sumaPagos}) es menor al total del pedido (${totalPedido})`,
          );
        }

        /*
         * Numeración LEGACY.
         *
         * Se conserva únicamente mientras
         * migramos completamente al nuevo flujo.
         */
        const conteo =
          await tx.factura.count();

        const numeroFactura =
          `SET-${conteo + 1}`;

        const nuevaFactura =
          await tx.factura.create({
            data: {
              numero:
                numeroFactura,

              total:
                totalPedido,

              resolucionDian:
                data.resolucionDian ||
                '18760000001',

              pedidoId:
                pedido.id,

              pagos: {
                create:
                  data.pagos.map(
                    (pago) => ({
                      monto:
                        pago.monto,

                      metodoPagoId:
                        pago.metodoPagoId,
                    }),
                  ),
              },
            },

            include: {
              pagos: true,
            },
          });

        /*
         * Comportamiento legacy:
         * marcar pedido como facturado.
         */
        await tx.pedido.update({
          where: {
            id: pedido.id,
          },

          data: {
            estado:
              EstadoPedido.FACTURADO,
          },
        });

        /*
         * Comportamiento legacy:
         * liberar mesa.
         */
        if (
          pedido.mesaId !== null
        ) {
          await tx.mesa.update({
            where: {
              id: pedido.mesaId,
            },

            data: {
              situacion:
                EstadoMesa.LIBRE,
            },
          });
        }

        return nuevaFactura;
      },
    );
  }

  /*
   * =====================================================
   * NUEVO FLUJO
   *
   * Venta -> Factura
   *
   * Los pagos pertenecen a Venta.
   * Factura NO vuelve a crear pagos.
   * =====================================================
   */
  async crearDesdeVenta(
    ventaId: number,
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
              factura: true,

              pagos: {
                include: {
                  metodoPago: true,
                },
              },

              detalles: true,
              pedido: true,
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
            'No se puede facturar una venta anulada',
          );
        }

        if (venta.factura) {
          throw new BadRequestException(
            'La venta ya tiene una factura asociada',
          );
        }

        /*
         * Número interno único.
         *
         * NO corresponde todavía a numeración
         * fiscal autorizada por la DIAN.
         */
        const numeroFactura =
          `INT-${crypto.randomUUID()}`;

        const factura =
          await tx.factura.create({
            data: {
              numero:
                numeroFactura,

              total:
                venta.total,

              ventaId:
                venta.id,

              /*
               * Si la venta nació desde un pedido,
               * conservamos temporalmente también
               * esa referencia.
               *
               * DIRECTA / MANUAL_CIERRE:
               * pedidoId = null.
               */
              pedidoId:
                venta.pedidoId,
            },

            include: {
              venta: {
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
                },
              },
            },
          });

        return factura;
      },
    );
  }

  /*
   * =====================================================
   * CORTE TEMPORAL
   *
   * Sigue viviendo en Facturas mientras construimos
   * el módulo formal de Caja.
   *
   * Soporta:
   * - facturas legacy;
   * - facturas provenientes de Venta.
   * =====================================================
   */
  async obtenerCorteCaja(
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

    const facturas =
      await this.prisma.factura.findMany({
        where: {
          AND: [
            {
              creadoEn: {
                gte: inicio,
                lte: fin,
              },
            },

            {
              estado: 'EMITIDA',
            },

            this.filtroFacturaTenant(
              usuarioActual,
            ),
          ],
        },

        include: {
          /*
           * Pagos legacy.
           */
          pagos: {
            include: {
              metodoPago: true,
            },
          },

          /*
           * Pagos del nuevo núcleo comercial.
           */
          venta: {
            include: {
              pagos: {
                include: {
                  metodoPago: true,
                },
              },
            },
          },
        },

        orderBy: {
          creadoEn: 'asc',
        },
      });

    let totalVentas = 0;

    const desglosePorMetodo:
      Record<string, number> = {};

    for (
      const factura of facturas
    ) {
      totalVentas +=
        factura.total.toNumber();

      /*
       * Nueva factura:
       * pagos pertenecen a Venta.
       *
       * Factura legacy:
       * pagos pertenecen directamente a Factura.
       */
      const pagos =
        factura.venta
          ? factura.venta.pagos
          : factura.pagos;

      for (
        const pago of pagos
      ) {
        const metodo =
          pago.metodoPago.nombre;

        const monto =
          pago.monto.toNumber();

        if (
          !desglosePorMetodo[
            metodo
          ]
        ) {
          desglosePorMetodo[
            metodo
          ] = 0;
        }

        desglosePorMetodo[
          metodo
        ] += monto;
      }
    }

    return {
      fechaInicio: inicio,
      fechaFin: fin,

      cantidadFacturas:
        facturas.length,

      totalVentas,

      desglosePagos:
        desglosePorMetodo,
    };
  }

  /*
   * =====================================================
   * SIMULACIÓN DIAN
   *
   * IMPORTANTE:
   * esto NO representa aceptación real de la DIAN.
   *
   * Funciona tanto con factura legacy
   * como con factura originada desde Venta.
   * =====================================================
   */
}