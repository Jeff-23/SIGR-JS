import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  EstadoMesa,
  EstadoPedido,
} from '@prisma/client';

import * as crypto from 'crypto';

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

  async create(
    data: CreateFacturaDto,
    usuarioActual: UsuarioAutenticado,
  ) {
    return this.prisma.$transaction(async (tx) => {
      /*
       * 1. Buscar el pedido únicamente dentro
       *    del alcance del usuario autenticado.
       */
      const pedido = await tx.pedido.findFirst({
        where: {
          id: data.pedidoId,

          sucursal: {
            estado: true,

            restaurante: {
              estado: true,
            },

            ...(!this.esSuperadmin(usuarioActual)
              ? {
                  restauranteId:
                    usuarioActual.restauranteId!,
                }
              : {}),

            ...(usuarioActual.sucursalId !== null
              ? {
                  id: usuarioActual.sucursalId,
                }
              : {}),
          },
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

      /*
       * 2. Impedir doble facturación.
       */
      if (
        pedido.factura ||
        pedido.estado === EstadoPedido.FACTURADO
      ) {
        throw new BadRequestException(
          'Este pedido ya fue facturado',
        );
      }

      /*
       * 3. No permitir facturar pedidos cancelados.
       */
      if (
        pedido.estado === EstadoPedido.CANCELADO
      ) {
        throw new BadRequestException(
          'No se puede facturar un pedido cancelado',
        );
      }

      /*
       * 4. Validar métodos de pago.
       *
       * Por ahora MetodoPago funciona como catálogo
       * global de plataforma.
       */
      const idsMetodosPago = [
        ...new Set(
          data.pagos.map(
            (pago) => pago.metodoPagoId,
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

      /*
       * 5. Calcular y validar el total pagado.
       */
      const totalPedido =
        pedido.total.toNumber();

      const sumaPagos =
        data.pagos.reduce(
          (sum, pago) =>
            sum + pago.monto,
          0,
        );

      if (sumaPagos < totalPedido) {
        throw new BadRequestException(
          `El monto pagado (${sumaPagos}) es menor al total del pedido (${totalPedido})`,
        );
      }

      /*
       * 6. Generar número temporal de factura.
       *
       * Esto NO representa todavía el consecutivo
       * fiscal definitivo de la DIAN.
       */
      const conteo =
        await tx.factura.count();

      const numeroFactura =
        `SET-${conteo + 1}`;

      /*
       * 7. Crear factura y pagos.
       */
      const nuevaFactura =
        await tx.factura.create({
          data: {
            numero: numeroFactura,

            total: totalPedido,

            resolucionDian:
              data.resolucionDian ||
              '18760000001',

            pedidoId: pedido.id,

            pagos: {
              create: data.pagos.map(
                (pago) => ({
                  monto: pago.monto,
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
       * 8. Marcar el pedido como facturado.
       */
      await tx.pedido.update({
        where: {
          id: pedido.id,
        },

        data: {
          estado: EstadoPedido.FACTURADO,
        },
      });

      /*
       * 9. Liberar la mesa únicamente
       *    si el pedido tiene una asociada.
       */
      if (pedido.mesaId !== null) {
        await tx.mesa.update({
          where: {
            id: pedido.mesaId,
          },

          data: {
            situacion: EstadoMesa.LIBRE,
          },
        });
      }

      return nuevaFactura;
    });
  }

  async obtenerCorteCaja(
    fechaInicio: string | undefined,
    fechaFin: string | undefined,
    usuarioActual: UsuarioAutenticado,
  ) {
    /*
     * Si no se indican fechas:
     * desde las 00:00 de hoy hasta ahora.
     */
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const inicio =
      fechaInicio
        ? new Date(fechaInicio)
        : hoy;

    const fin =
      fechaFin
        ? new Date(fechaFin)
        : new Date();

    /*
     * Validar fechas.
     */
    if (
      Number.isNaN(inicio.getTime()) ||
      Number.isNaN(fin.getTime())
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

    /*
     * Consultar solamente las facturas
     * pertenecientes al tenant actual.
     */
    const facturas =
      await this.prisma.factura.findMany({
        where: {
          creadoEn: {
            gte: inicio,
            lte: fin,
          },

          estado: 'EMITIDA',

          pedido: {
            sucursal: {
              estado: true,

              restaurante: {
                estado: true,
              },

              ...(!this.esSuperadmin(usuarioActual)
                ? {
                    restauranteId:
                      usuarioActual.restauranteId!,
                  }
                : {}),

              ...(usuarioActual.sucursalId !== null
                ? {
                    id:
                      usuarioActual.sucursalId,
                  }
                : {}),
            },
          },
        },

        include: {
          pagos: {
            include: {
              metodoPago: true,
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

    for (const factura of facturas) {
      totalVentas +=
        factura.total.toNumber();

      for (const pago of factura.pagos) {
        const metodo =
          pago.metodoPago.nombre;

        const monto =
          pago.monto.toNumber();

        if (!desglosePorMetodo[metodo]) {
          desglosePorMetodo[metodo] = 0;
        }

        desglosePorMetodo[metodo] +=
          monto;
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

  async emitirDian(
    id: number,
    usuarioActual: UsuarioAutenticado,
  ) {
    /*
     * Buscar únicamente una factura que
     * pertenezca al tenant del usuario.
     */
    const factura =
      await this.prisma.factura.findFirst({
        where: {
          id,

          pedido: {
            sucursal: {
              estado: true,

              restaurante: {
                estado: true,
              },

              ...(!this.esSuperadmin(usuarioActual)
                ? {
                    restauranteId:
                      usuarioActual.restauranteId!,
                  }
                : {}),

              ...(usuarioActual.sucursalId !== null
                ? {
                    id:
                      usuarioActual.sucursalId,
                  }
                : {}),
            },
          },
        },
      });

    if (!factura) {
      throw new NotFoundException(
        'Factura no encontrada',
      );
    }

    if (factura.cufe) {
      throw new BadRequestException(
        'Esta factura ya fue procesada en la simulación electrónica',
      );
    }

    /*
     * IMPORTANTE:
     * Esto continúa siendo una simulación.
     *
     * No significa que la DIAN haya
     * aceptado realmente el documento.
     */
    const dataToHash =
      `${factura.numero}` +
      `${factura.total}` +
      `${factura.resolucionDian}` +
      `${factura.creadoEn.toISOString()}`;

    const cufeGenerado =
      crypto
        .createHash('sha384')
        .update(dataToHash)
        .digest('hex');

    const qrGenerado =
      `https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=${cufeGenerado}`;

    return this.prisma.factura.update({
      where: {
        id: factura.id,
      },

      data: {
        cufe: cufeGenerado,
        qrCode: qrGenerado,
      },
    });
  }
}