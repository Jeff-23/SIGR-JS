import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { EstadoVenta, Prisma } from '@prisma/client';

import { randomUUID } from 'crypto';

import { PrismaService } from '../../prisma/prisma.service';

import { CreateFacturaDto } from './dto/create-factura.dto';

import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';

@Injectable()
export class FacturasService {
  constructor(private readonly prisma: PrismaService) {}

  private esSuperadmin(usuarioActual: UsuarioAutenticado) {
    return (
      usuarioActual.rol === 'SUPERADMIN' && usuarioActual.restauranteId === null
    );
  }

  /*
   * =====================================================
   * AISLAMIENTO MULTITENANT
   * =====================================================
   *
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

  /*
   * =====================================================
   * FLUJO LEGACY RETIRADO
   * =====================================================
   *
   * Anteriormente:
   *
   * Pedido
   * -> Factura
   * -> Pago ligado a Factura
   * -> Pedido FACTURADO
   * -> Mesa LIBRE
   *
   * Ese comportamiento entra en conflicto con
   * el nucleo comercial vigente:
   *
   * Pedido
   * -> Venta
   * -> Pago
   * -> Venta PAGADA
   * -> Mesa LIBRE
   *
   * Las relaciones antiguas de Prisma se mantienen
   * temporalmente para consultar información histórica,
   * pero ya no se generan nuevas operaciones legacy.
   */
  createLegacy(
    _data: CreateFacturaDto,

    _usuarioActual: UsuarioAutenticado,
  ): never {
    void _data;
    void _usuarioActual;
    throw new BadRequestException(
      'El flujo Pedido -> Factura -> Pago fue retirado. Primero debe generar la Venta del pedido, registrar sus pagos y emitir la Factura desde la Venta.',
    );
  }

  /*
   * =====================================================
   * FLUJO VIGENTE
   * =====================================================
   *
   * Venta -> Factura
   *
   * Responsabilidades:
   *
   * Factura:
   * - documenta la Venta
   *
   * Venta:
   * - representa la operación comercial
   *
   * Pago:
   * - representa el dinero recibido
   *
   * Mesa:
   * - se libera exclusivamente por el flujo
   *   comercial de Venta/Pago
   *
   * Crear una Factura:
   *
   * NO crea pagos.
   * NO libera mesas.
   * NO cambia EstadoVenta.
   * NO cambia EstadoPedido.
   */
  async crearDesdeVenta(
    ventaId: number,

    usuarioActual: UsuarioAutenticado,
  ) {
    const facturaId = await this.prisma.transaccionSerializable(async (tx) => {
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
        where: {
          id: ventaAlcanzable.id,
        },

        include: { factura: { select: { id: true } } },
      });

      if (venta.estado === EstadoVenta.ANULADA) {
        throw new BadRequestException('No se puede facturar una venta anulada');
      }

      if (venta.factura) {
        return venta.factura.id;
      }

      /*
       * La Factura puede emitirse tanto para
       * una Venta PENDIENTE_PAGO como PAGADA.
       *
       * Esto es intencional:
       *
       * facturación y recaudo son dominios
       * independientes.
       *
       * En ningún caso emitir la factura
       * cambia el estado del pago o de la mesa.
       */

      const numeroFactura = `INT-${randomUUID()}`;

      const factura = await tx.factura.create({
        data: {
          numero: numeroFactura,

          total: venta.total,

          ventaId: venta.id,

          /*
           * Si la Venta nació desde un Pedido,
           * conservamos también la referencia.
           *
           * Para:
           *
           * DIRECTA
           * MANUAL_CIERRE
           *
           * pedidoId permanece null.
           */
          pedidoId: venta.pedidoId,
        },

        select: { id: true },
      });
      return factura.id;
    });

    return this.prisma.factura.findUniqueOrThrow({
      where: { id: facturaId },
      include: {
        venta: {
          include: {
            detalles: { include: { producto: true } },
            pagos: { include: { metodoPago: true } },
            pedido: { include: { mesa: { include: { zona: true } } } },
          },
        },
      },
    });
  }
}
