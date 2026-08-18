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
}