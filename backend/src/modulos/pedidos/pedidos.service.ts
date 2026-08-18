import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  EstadoMesa,
  EstadoPedido,
  Prisma,
  TipoPedido,
} from '@prisma/client';

import {
  PrismaService,
} from '../../prisma/prisma.service';

import {
  CreatePedidoDto,
} from './dto/create-pedido.dto';

import {
  UsuarioAutenticado,
} from '../auth/types/usuario-autenticado.type';

@Injectable()
export class PedidosService {
  constructor(
    private readonly prisma:
      PrismaService,
  ) {}

  private esSuperadmin(
    usuarioActual:
      UsuarioAutenticado,
  ) {
    return (
      usuarioActual.restauranteId ===
      null
    );
  }

  private filtroSucursal(
    usuarioActual:
      UsuarioAutenticado,
  ): Prisma.SucursalWhereInput {
    return {
      estado: true,

      restaurante: {
        estado: true,

        ...(!this.esSuperadmin(
          usuarioActual,
        )
          ? {
              id:
                usuarioActual
                  .restauranteId!,
            }
          : {}),
      },

      ...(usuarioActual.sucursalId !==
      null
        ? {
            id:
              usuarioActual
                .sucursalId,
          }
        : {}),
    };
  }

  private validarCapacidadMesas(
    usuarioActual:
      UsuarioAutenticado,
  ) {
    /*
     * SUPERADMIN global posee bypass,
     * igual que CapabilitiesGuard.
     */
    if (
      this.esSuperadmin(
        usuarioActual,
      )
    ) {
      return;
    }

    if (
      !usuarioActual.capacidades.includes(
        'MESAS',
      )
    ) {
      throw new ForbiddenException(
        'La gestión de mesas no está incluida en el plan del restaurante',
      );
    }
  }

  private async resolverSucursalSinMesa(
    tx:
      Prisma.TransactionClient,

    data:
      CreatePedidoDto,

    usuarioActual:
      UsuarioAutenticado,
  ) {
    /*
     * Usuario ligado directamente
     * a una sucursal:
     *
     * esa sucursal es siempre la
     * autoridad del request.
     */
    if (
      usuarioActual.sucursalId !==
      null
    ) {
      if (
        data.sucursalId !==
          undefined &&
        data.sucursalId !==
          usuarioActual.sucursalId
      ) {
        throw new ForbiddenException(
          'No puedes crear pedidos en otra sucursal',
        );
      }

      const sucursal =
        await tx.sucursal.findFirst({
          where: {
            id:
              usuarioActual
                .sucursalId,

            ...this.filtroSucursal(
              usuarioActual,
            ),
          },

          select: {
            id: true,
          },
        });

      if (!sucursal) {
        throw new NotFoundException(
          'Sucursal no encontrada',
        );
      }

      return sucursal.id;
    }

    /*
     * ADMIN de restaurante o SUPERADMIN
     * sin sucursal fija:
     *
     * debe indicar explícitamente
     * en cuál sucursal ocurre el pedido.
     */
    if (
      data.sucursalId === undefined
    ) {
      throw new BadRequestException(
        'Debe indicar la sucursal del pedido',
      );
    }

    const sucursal =
      await tx.sucursal.findFirst({
        where: {
          id:
            data.sucursalId,

          ...this.filtroSucursal(
            usuarioActual,
          ),
        },

        select: {
          id: true,
        },
      });

    if (!sucursal) {
      throw new NotFoundException(
        'Sucursal no encontrada',
      );
    }

    return sucursal.id;
  }

  private async resolverContextoPedido(
    tx:
      Prisma.TransactionClient,

    data:
      CreatePedidoDto,

    usuarioActual:
      UsuarioAutenticado,
  ): Promise<{
    sucursalId: number;
    mesaId: number | null;
  }> {
    /*
     * MANUAL no representa un canal
     * operativo normal.
     *
     * El cierre manual pertenece al
     * flujo comercial:
     *
     * Venta.MANUAL_CIERRE
     */
    if (
      data.tipo ===
      TipoPedido.MANUAL
    ) {
      throw new BadRequestException(
        'Los registros manuales de cierre deben realizarse mediante el flujo de ventas manuales',
      );
    }

    if (
      data.tipo ===
      TipoPedido.MESA
    ) {
      this.validarCapacidadMesas(
        usuarioActual,
      );

      if (
        data.mesaId ===
        undefined
      ) {
        throw new BadRequestException(
          'Un pedido de tipo MESA requiere mesaId',
        );
      }

      const mesa =
        await tx.mesa.findFirst({
          where: {
            id:
              data.mesaId,

            estado: true,

            zona: {
              estado: true,

              sucursal: {
                ...this.filtroSucursal(
                  usuarioActual,
                ),
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

      if (
        data.sucursalId !==
          undefined &&
        data.sucursalId !==
          mesa.zona.sucursalId
      ) {
        throw new BadRequestException(
          'La mesa no pertenece a la sucursal indicada',
        );
      }

      if (
        mesa.situacion !==
        EstadoMesa.LIBRE
      ) {
        throw new BadRequestException(
          'La mesa ya está ocupada o no está disponible',
        );
      }

      /*
       * Reserva atómica de la mesa.
       */
      const mesaReservada =
        await tx.mesa.updateMany({
          where: {
            id:
              mesa.id,

            estado: true,

            situacion:
              EstadoMesa.LIBRE,
          },

          data: {
            situacion:
              EstadoMesa.OCUPADA,
          },
        });

      if (
        mesaReservada.count !==
        1
      ) {
        throw new BadRequestException(
          'La mesa acaba de ser ocupada por otro pedido',
        );
      }

      return {
        sucursalId:
          mesa.zona.sucursalId,

        mesaId:
          mesa.id,
      };
    }

    /*
     * Pedidos sin mesa.
     */
    if (
      data.mesaId !==
      undefined
    ) {
      throw new BadRequestException(
        `Un pedido ${data.tipo} no debe tener mesaId`,
      );
    }

    const sucursalId =
      await this.resolverSucursalSinMesa(
        tx,
        data,
        usuarioActual,
      );

    return {
      sucursalId,
      mesaId: null,
    };
  }

  async create(
    data:
      CreatePedidoDto,

    usuarioActual:
      UsuarioAutenticado,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const contexto =
          await this.resolverContextoPedido(
            tx,
            data,
            usuarioActual,
          );

        /*
         * Agrupar productos repetidos.
         *
         * Evita múltiples líneas del mismo
         * producto dentro del mismo pedido.
         */
        const cantidades =
          new Map<
            number,
            number
          >();

        for (
          const item of data.detalles
        ) {
          cantidades.set(
            item.productoId,

            (cantidades.get(
              item.productoId,
            ) ?? 0) +
              item.cantidad,
          );
        }

        const productosIds = [
          ...cantidades.keys(),
        ];

        const productos =
          await tx.producto.findMany({
            where: {
              id: {
                in:
                  productosIds,
              },

              estado: true,

              categoria: {
                estado: true,

                sucursalId:
                  contexto.sucursalId,

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
                    },
                  },
                },
              },
            },
          });

        if (
          productos.length !==
          productosIds.length
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

        let totalPedido =
          new Prisma.Decimal(0);

        const detallesPreparados: {
          productoId: number;
          cantidad: number;
          precioUnitario:
            Prisma.Decimal;
          subtotal:
            Prisma.Decimal;
        }[] = [];

        /*
         * Preparar detalles y descontar
         * inventario por receta.
         */
        for (
          const [
            productoId,
            cantidad,
          ] of cantidades
        ) {
          const producto =
            productosPorId.get(
              productoId,
            );

          if (!producto) {
            throw new NotFoundException(
              `Producto con ID ${productoId} no encontrado`,
            );
          }

          const subtotal =
            producto.precio.mul(
              cantidad,
            );

          totalPedido =
            totalPedido.plus(
              subtotal,
            );

          detallesPreparados.push({
            productoId:
              producto.id,

            cantidad,

            precioUnitario:
              producto.precio,

            subtotal,
          });

          for (
            const receta of
              producto.recetas
          ) {
            const articulo =
              receta.articulo;

            if (
              !articulo.estado ||
              articulo.sucursalId !==
                contexto.sucursalId
            ) {
              throw new BadRequestException(
                `La receta del producto "${producto.nombre}" contiene un artículo inválido para esta sucursal`,
              );
            }

            const cantidadADescontar =
              receta.cantidad.mul(
                cantidad,
              );

            /*
             * Descuento atómico.
             *
             * La condición stock >= cantidad
             * y el decrement ocurren en una
             * sola operación SQL.
             *
             * Esto evita la carrera:
             *
             * request A lee 10
             * request B lee 10
             * ambos descuentan
             * y dejan stock negativo.
             */
            const actualizado =
              await tx.articulo.updateMany({
                where: {
                  id:
                    articulo.id,

                  estado: true,

                  sucursalId:
                    contexto.sucursalId,

                  stock: {
                    gte:
                      cantidadADescontar,
                  },
                },

                data: {
                  stock: {
                    decrement:
                      cantidadADescontar,
                  },
                },
              });

            if (
              actualizado.count !==
              1
            ) {
              throw new BadRequestException(
                `Stock insuficiente de "${articulo.nombre}" para preparar "${producto.nombre}"`,
              );
            }
          }
        }

        const pedido =
          await tx.pedido.create({
            data: {
              sucursalId:
                contexto.sucursalId,

              mesaId:
                contexto.mesaId,

              usuarioId:
                usuarioActual.id,

              tipo:
                data.tipo,

              estado:
                EstadoPedido.PENDIENTE,

              total:
                totalPedido,

              detalles: {
                create:
                  detallesPreparados,
              },
            },

            include: {
              detalles: {
                include: {
                  producto: true,
                },
              },

              mesa: {
                include: {
                  zona: true,
                },
              },
            },
          });

        return pedido;
      },

      {
        isolationLevel:
          Prisma.TransactionIsolationLevel
            .Serializable,
      },
    );
  }

  findAll(
    usuarioActual:
      UsuarioAutenticado,
  ) {
    return this.prisma.pedido.findMany({
      where: {
        sucursal:
          this.filtroSucursal(
            usuarioActual,
          ),
      },

      include: {
        mesa: {
          include: {
            zona: true,
          },
        },

        usuario: {
          select: {
            id: true,
            nombres: true,
            apellidos: true,
          },
        },

        detalles: {
          include: {
            producto: true,
          },
        },

        comandas: {
          select: {
            id: true,
            estado: true,
            fechaEnvio: true,
          },
        },

        venta: {
          select: {
            id: true,
            estado: true,
            total: true,
          },
        },
      },

      orderBy: {
        creadoEn: 'desc',
      },
    });
  }

  async findOne(
    id: number,

    usuarioActual:
      UsuarioAutenticado,
  ) {
    const pedido =
      await this.prisma.pedido.findFirst({
        where: {
          id,

          sucursal:
            this.filtroSucursal(
              usuarioActual,
            ),
        },

        include: {
          sucursal: true,

          mesa: {
            include: {
              zona: true,
            },
          },

          usuario: {
            select: {
              id: true,
              nombres: true,
              apellidos: true,
              email: true,
            },
          },

          detalles: {
            include: {
              producto: true,

              comandas: {
                include: {
                  comanda: true,
                },
              },
            },
          },

          comandas: {
            include: {
              detalles: {
                include: {
                  detallePedido: {
                    include: {
                      producto: true,
                    },
                  },
                },
              },
            },

            orderBy: {
              fechaEnvio: 'asc',
            },
          },

          venta: {
            include: {
              pagos: {
                include: {
                  metodoPago: true,
                },
              },

              factura: true,
            },
          },
        },
      });

    if (!pedido) {
      throw new NotFoundException(
        'Pedido no encontrado',
      );
    }

    return pedido;
  }
}