import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  EstadoComanda,
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
  AgregarDetallesPedidoDto,
} from './dto/agregar-detalles-pedido.dto';

import {
  UsuarioAutenticado,
} from '../auth/types/usuario-autenticado.type';

type DetalleEntrada = {
  productoId: number;
  cantidad: number;
};

type DetallePreparado = {
  productoId: number;
  cantidad: number;
  precioUnitario:
    Prisma.Decimal;
  subtotal:
    Prisma.Decimal;
};

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
        'La gestion de mesas no esta incluida en el plan del restaurante',
      );
    }
  }

  private agruparCantidades(
    detalles:
      DetalleEntrada[],
  ) {
    const cantidades =
      new Map<
        number,
        number
      >();

    for (
      const detalle of detalles
    ) {
      cantidades.set(
        detalle.productoId,

        (cantidades.get(
          detalle.productoId,
        ) ?? 0) +
          detalle.cantidad,
      );
    }

    return cantidades;
  }

  private async prepararDetallesYDescontarInventario(
    tx:
      Prisma.TransactionClient,

    sucursalId:
      number,

    detalles:
      DetalleEntrada[],
  ): Promise<{
    total:
      Prisma.Decimal;

    detalles:
      DetallePreparado[];
  }> {
    const cantidades =
      this.agruparCantidades(
        detalles,
      );

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
        'Uno o mas productos no existen o no pertenecen a la sucursal',
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

    let total =
      new Prisma.Decimal(0);

    const detallesPreparados:
      DetallePreparado[] = [];

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

      total =
        total.plus(
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
            sucursalId
        ) {
          throw new BadRequestException(
            `La receta del producto "${producto.nombre}" contiene un articulo invalido para esta sucursal`,
          );
        }

        const cantidadADescontar =
          receta.cantidad.mul(
            cantidad,
          );

        const actualizado =
          await tx.articulo.updateMany({
            where: {
              id:
                articulo.id,

              estado: true,

              sucursalId,

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

    return {
      total,

      detalles:
        detallesPreparados,
    };
  }

  private async resolverSucursalSinMesa(
    tx:
      Prisma.TransactionClient,

    data:
      CreatePedidoDto,

    usuarioActual:
      UsuarioAutenticado,
  ) {
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
          'La mesa ya esta ocupada o no esta disponible',
        );
      }

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

        const preparado =
          await this
            .prepararDetallesYDescontarInventario(
              tx,
              contexto.sucursalId,
              data.detalles,
            );

        return tx.pedido.create({
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
              preparado.total,

            detalles: {
              create:
                preparado.detalles,
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
      },

      {
        isolationLevel:
          Prisma.TransactionIsolationLevel
            .Serializable,
      },
    );
  }

  async agregarDetalles(
    pedidoId:
      number,

    data:
      AgregarDetallesPedidoDto,

    usuarioActual:
      UsuarioAutenticado,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const pedido =
          await tx.pedido.findFirst({
            where: {
              id:
                pedidoId,

              sucursal:
                this.filtroSucursal(
                  usuarioActual,
                ),
            },

            include: {
              venta: {
                select: {
                  id: true,
                },
              },

              factura: {
                select: {
                  id: true,
                },
              },
            },
          });

        if (!pedido) {
          throw new NotFoundException(
            'Pedido no encontrado',
          );
        }

        if (
          pedido.estado ===
          EstadoPedido.CANCELADO
        ) {
          throw new BadRequestException(
            'No se pueden agregar productos a un pedido cancelado',
          );
        }

        if (
          pedido.estado ===
            EstadoPedido.FACTURADO ||
          pedido.factura
        ) {
          throw new BadRequestException(
            'No se pueden agregar productos a un pedido facturado',
          );
        }

        if (
          pedido.venta
        ) {
          throw new BadRequestException(
            'No se pueden agregar productos despues de generar la venta del pedido',
          );
        }

        const preparado =
          await this
            .prepararDetallesYDescontarInventario(
              tx,
              pedido.sucursalId,
              data.detalles,
            );

        const estadoNuevo =
          pedido.estado ===
            EstadoPedido.LISTO ||
          pedido.estado ===
            EstadoPedido.ENTREGADO
            ? EstadoPedido.PENDIENTE
            : pedido.estado;

        return tx.pedido.update({
          where: {
            id:
              pedido.id,
          },

          data: {
            total: {
              increment:
                preparado.total,
            },

            estado:
              estadoNuevo,

            detalles: {
              create:
                preparado.detalles,
            },
          },

          include: {
            detalles: {
              include: {
                producto: true,
              },

              orderBy: {
                id: 'asc',
              },
            },

            mesa: {
              include: {
                zona: true,
              },
            },

            comandas: {
              select: {
                id: true,
                estado: true,
                fechaEnvio: true,
              },

              orderBy: {
                fechaEnvio: 'asc',
              },
            },
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

  /*
   * =====================================================
   * CANCELAR PEDIDO
   * =====================================================
   *
   * Se permite cancelar cuando:
   *
   * - no existe Venta
   * - no existe Factura
   * - ninguna Comanda ha iniciado preparacion
   *
   * Las comandas PENDIENTE se convierten
   * automaticamente en CANCELADA.
   *
   * Tambien:
   *
   * - se repone inventario
   * - se libera la mesa
   * - Pedido pasa a CANCELADO
   */
  async cancelar(
    pedidoId:
      number,

    usuarioActual:
      UsuarioAutenticado,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const pedido =
          await tx.pedido.findFirst({
            where: {
              id:
                pedidoId,

              sucursal:
                this.filtroSucursal(
                  usuarioActual,
                ),
            },

            include: {
              venta: {
                select: {
                  id: true,
                  estado: true,
                },
              },

              factura: {
                select: {
                  id: true,
                },
              },

              mesa: {
                select: {
                  id: true,
                  situacion: true,
                },
              },

              comandas: {
                select: {
                  id: true,
                  estado: true,
                },
              },

              detalles: {
                include: {
                  producto: {
                    include: {
                      recetas: {
                        include: {
                          articulo: {
                            select: {
                              id: true,
                              nombre: true,
                              sucursalId: true,
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          });

        if (!pedido) {
          throw new NotFoundException(
            'Pedido no encontrado',
          );
        }

        if (
          pedido.estado ===
          EstadoPedido.CANCELADO
        ) {
          throw new BadRequestException(
            'El pedido ya esta cancelado',
          );
        }

        if (
          pedido.estado ===
            EstadoPedido.FACTURADO ||
          pedido.factura
        ) {
          throw new BadRequestException(
            'No se puede cancelar un pedido facturado',
          );
        }

        if (
          pedido.venta
        ) {
          throw new BadRequestException(
            'No se puede cancelar el pedido despues de generar su venta',
          );
        }

        if (
          pedido.estado ===
            EstadoPedido.EN_PREPARACION ||
          pedido.estado ===
            EstadoPedido.LISTO ||
          pedido.estado ===
            EstadoPedido.ENTREGADO
        ) {
          throw new BadRequestException(
            'No se puede cancelar el pedido porque su preparacion ya avanzo',
          );
        }

        const comandaAvanzada =
          pedido.comandas.find(
            (comanda) =>
              comanda.estado ===
                EstadoComanda.EN_PREPARACION ||
              comanda.estado ===
                EstadoComanda.LISTA ||
              comanda.estado ===
                EstadoComanda.ENTREGADA,
          );

        if (comandaAvanzada) {
          throw new BadRequestException(
            'No se puede cancelar el pedido porque existe una comanda que ya inicio preparacion',
          );
        }

        /*
         * Cancelar todas las comandas que
         * aun no han iniciado preparacion.
         */
        await tx.comanda.updateMany({
          where: {
            pedidoId:
              pedido.id,

            estado:
              EstadoComanda.PENDIENTE,
          },

          data: {
            estado:
              EstadoComanda.CANCELADA,
          },
        });

        /*
         * =================================================
         * REPONER INVENTARIO
         * =================================================
         *
         * Agrupamos por articulo para evitar realizar
         * varias actualizaciones del mismo stock.
         */
        const reposicionPorArticulo =
          new Map<
            number,
            {
              nombre: string;
              sucursalId: number;
              cantidad:
                Prisma.Decimal;
            }
          >();

        for (
          const detalle of
            pedido.detalles
        ) {
          for (
            const receta of
              detalle.producto.recetas
          ) {
            const articulo =
              receta.articulo;

            if (
              articulo.sucursalId !==
              pedido.sucursalId
            ) {
              throw new BadRequestException(
                `El articulo "${articulo.nombre}" no pertenece a la sucursal del pedido`,
              );
            }

            const cantidad =
              receta.cantidad.mul(
                detalle.cantidad,
              );

            const existente =
              reposicionPorArticulo.get(
                articulo.id,
              );

            if (existente) {
              existente.cantidad =
                existente.cantidad.plus(
                  cantidad,
                );
            } else {
              reposicionPorArticulo.set(
                articulo.id,
                {
                  nombre:
                    articulo.nombre,

                  sucursalId:
                    articulo.sucursalId,

                  cantidad,
                },
              );
            }
          }
        }

        for (
          const [
            articuloId,
            reposicion,
          ] of reposicionPorArticulo
        ) {
          const actualizado =
            await tx.articulo.updateMany({
              where: {
                id:
                  articuloId,

                sucursalId:
                  reposicion.sucursalId,
              },

              data: {
                stock: {
                  increment:
                    reposicion.cantidad,
                },
              },
            });

          if (
            actualizado.count !==
            1
          ) {
            throw new BadRequestException(
              `No fue posible reponer el inventario de "${reposicion.nombre}"`,
            );
          }
        }

        /*
         * =================================================
         * LIBERAR MESA
         * =================================================
         *
         * Solo corresponde cuando esta mesa sigue
         * ocupada por este pedido.
         */
        if (
          pedido.mesaId !==
          null
        ) {
          if (
            pedido.mesa?.situacion ===
            EstadoMesa.PENDIENTE_PAGO
          ) {
            /*
             * En condiciones normales esto no puede
             * ocurrir sin Venta. Aun asi evitamos
             * liberar silenciosamente una mesa en
             * estado comercial inconsistente.
             */
            throw new BadRequestException(
              'La mesa esta pendiente de pago y el pedido no puede cancelarse desde este flujo',
            );
          }

          await tx.mesa.updateMany({
            where: {
              id:
                pedido.mesaId,

              situacion:
                EstadoMesa.OCUPADA,
            },

            data: {
              situacion:
                EstadoMesa.LIBRE,
            },
          });
        }

        /*
         * =================================================
         * CANCELAR PEDIDO
         * =================================================
         */
        return tx.pedido.update({
          where: {
            id:
              pedido.id,
          },

          data: {
            estado:
              EstadoPedido.CANCELADO,
          },

          include: {
            sucursal: true,

            mesa: {
              include: {
                zona: true,
              },
            },

            detalles: {
              include: {
                producto: true,
              },

              orderBy: {
                id: 'asc',
              },
            },

            comandas: {
              include: {
                detalles: true,
              },

              orderBy: {
                fechaEnvio:
                  'asc',
              },
            },
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
    id:
      number,

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