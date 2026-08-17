import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  EstadoMesa,
  EstadoPedido,
  TipoPedido,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { CreatePedidoDto } from './dto/create-pedido.dto';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';

@Injectable()
export class PedidosService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  private esSuperadmin(
    usuarioActual: UsuarioAutenticado,
  ) {
    return usuarioActual.restauranteId === null;
  }

  async create(
    data: CreatePedidoDto,
    usuarioActual: UsuarioAutenticado,
  ) {
    return this.prisma.$transaction(async (tx) => {
      /*
       * 1. Buscar la mesa únicamente dentro del alcance
       *    real del usuario autenticado.
       */
      const mesa = await tx.mesa.findFirst({
        where: {
          id: data.mesaId,
          estado: true,

          zona: {
            estado: true,

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
        },

        include: {
          zona: {
            select: {
              sucursalId: true,
            },
          },
        },
      });

      if (!mesa) {
        throw new NotFoundException(
          'Mesa no encontrada',
        );
      }

      if (mesa.situacion !== EstadoMesa.LIBRE) {
        throw new BadRequestException(
          'La mesa ya está ocupada o no está disponible',
        );
      }

      const sucursalId = mesa.zona.sucursalId;

      /*
       * 2. Reservar la mesa de forma atómica.
       *
       * Evita que dos peticiones simultáneas creen
       * dos pedidos sobre la misma mesa libre.
       */
      const mesaReservada =
        await tx.mesa.updateMany({
          where: {
            id: data.mesaId,
            estado: true,
            situacion: EstadoMesa.LIBRE,
          },

          data: {
            situacion: EstadoMesa.OCUPADA,
          },
        });

      if (mesaReservada.count !== 1) {
        throw new BadRequestException(
          'La mesa acaba de ser ocupada por otro pedido',
        );
      }

      let totalPedido = 0;

      const detallesPreparados: {
        productoId: number;
        cantidad: number;
        precioUnitario: number;
        subtotal: number;
      }[] = [];

      /*
       * 3. Procesar los productos del pedido.
       */
      for (const item of data.detalles) {
        const producto =
          await tx.producto.findFirst({
            where: {
              id: item.productoId,
              estado: true,

              categoria: {
                estado: true,
                sucursalId,

                sucursal: {
                  estado: true,
                },
              },
            },

            include: {
              recetas: {
                include: {
                  articulo: {
                    select: {
                      id: true,
                      nombre: true,
                      estado: true,
                      sucursalId: true,
                      stock: true,
                    },
                  },
                },
              },
            },
          });

        if (!producto) {
          throw new NotFoundException(
            `Producto con ID ${item.productoId} no encontrado para esta sucursal`,
          );
        }

        const precioUnitario =
          producto.precio.toNumber();

        const subtotal =
          precioUnitario * item.cantidad;

        totalPedido += subtotal;

        detallesPreparados.push({
          productoId: item.productoId,
          cantidad: item.cantidad,
          precioUnitario,
          subtotal,
        });

        /*
         * 4. Validar y descontar inventario.
         */
        for (const receta of producto.recetas) {
          const articulo = receta.articulo;

          if (
            !articulo.estado ||
            articulo.sucursalId !== sucursalId
          ) {
            throw new BadRequestException(
              `La receta del producto "${producto.nombre}" contiene un artículo inválido para esta sucursal`,
            );
          }

          const cantidadADescontar =
            receta.cantidad.toNumber() *
            item.cantidad;

          if (
            articulo.stock.toNumber() <
            cantidadADescontar
          ) {
            throw new BadRequestException(
              `Stock insuficiente de "${articulo.nombre}" para preparar "${producto.nombre}"`,
            );
          }

          await tx.articulo.update({
            where: {
              id: articulo.id,
            },

            data: {
              stock: {
                decrement: cantidadADescontar,
              },
            },
          });
        }
      }

      /*
       * 5. Crear el pedido.
       */
      return tx.pedido.create({
        data: {
          sucursalId,
          mesaId: data.mesaId,
          usuarioId: usuarioActual.id,

          tipo: TipoPedido.MESA,
          estado: EstadoPedido.PENDIENTE,

          total: totalPedido,

          detalles: {
            create: detallesPreparados,
          },
        },

        include: {
          detalles: true,
        },
      });
    });
  }
}