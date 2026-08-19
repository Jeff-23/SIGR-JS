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

  /*
   * =====================================================
   * AGRUPAR PRODUCTOS DE UNA MISMA OPERACION
   * =====================================================
   *
   * Si una misma llamada contiene:
   *
   * producto 1 x1
   * producto 1 x2
   *
   * se procesa como:
   *
   * producto 1 x3
   *
   * IMPORTANTE:
   *
   * Esto solo agrupa dentro de LA MISMA llamada.
   *
   * Si el producto ya existia anteriormente en
   * el pedido, se crea un NUEVO DetallePedido.
   *
   * De esta manera las comandas anteriores
   * conservan su trazabilidad.
   */
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

  /*
   * =====================================================
   * PREPARAR DETALLES + INVENTARIO
   * =====================================================
   *
   * Funciona tanto para:
   *
   * - crear un Pedido
   * - agregar productos posteriormente
   *
   * El descuento de inventario por receta es
   * atomico:
   *
   * UPDATE articulo
   * WHERE stock >= consumo
   *
   * Esto evita dejar stock negativo por
   * concurrencia.
   */
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

      /*
       * Descontar los articulos asociados
       * mediante receta.
       */
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
    /*
     * Usuario ligado a sucursal.
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
     * sin sucursal fija.
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
     * MANUAL pertenece al flujo comercial:
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

    /*
     * ===================================================
     * PEDIDO DE MESA
     * ===================================================
     */
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

      /*
       * Reserva atomica de mesa.
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
     * ===================================================
     * PEDIDO SIN MESA
     * ===================================================
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

  /*
   * =====================================================
   * CREAR PEDIDO
   * =====================================================
   */
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

  /*
   * =====================================================
   * AGREGAR PRODUCTOS A PEDIDO EXISTENTE
   * =====================================================
   *
   * Caso real:
   *
   * Mesa pide:
   *   Hamburguesa x1
   *
   * Se envia a cocina.
   *
   * Minutos despues pide:
   *   Gaseosa x1
   *   Hamburguesa x2
   *
   * Estas nuevas unidades se crean como nuevos
   * DetallePedido y posteriormente pueden enviarse
   * en una nueva Comanda.
   */
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
        /*
         * Buscar exclusivamente dentro del
         * tenant/sucursal autorizados.
         */
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

        /*
         * Una vez cancelado no puede reabrirse
         * agregando productos.
         */
        if (
          pedido.estado ===
          EstadoPedido.CANCELADO
        ) {
          throw new BadRequestException(
            'No se pueden agregar productos a un pedido cancelado',
          );
        }

        /*
         * Flujo comercial antiguo.
         */
        if (
          pedido.estado ===
            EstadoPedido.FACTURADO ||
          pedido.factura
        ) {
          throw new BadRequestException(
            'No se pueden agregar productos a un pedido facturado',
          );
        }

        /*
         * Una Venta es un snapshot comercial
         * del Pedido.
         *
         * Si ya existe Venta no modificamos
         * posteriormente el Pedido porque los
         * totales dejarian de coincidir.
         */
        if (
          pedido.venta
        ) {
          throw new BadRequestException(
            'No se pueden agregar productos despues de generar la venta del pedido',
          );
        }

        /*
         * Validar productos, sucursal e inventario.
         */
        const preparado =
          await this
            .prepararDetallesYDescontarInventario(
              tx,
              pedido.sucursalId,
              data.detalles,
            );

        /*
         * Si el pedido ya habia terminado una ronda
         * de servicio (LISTO / ENTREGADO), una nueva
         * adicion lo reabre como PENDIENTE.
         *
         * Si ya existen preparaciones activas,
         * conservamos EN_PREPARACION.
         */
        const estadoNuevo =
          pedido.estado ===
            EstadoPedido.LISTO ||
          pedido.estado ===
            EstadoPedido.ENTREGADO
            ? EstadoPedido.PENDIENTE
            : pedido.estado;

        /*
         * La transaccion garantiza que:
         *
         * - inventario
         * - nuevas lineas
         * - nuevo total
         *
         * se confirmen juntos o se reviertan juntos.
         */
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
   * LISTAR PEDIDOS
   * =====================================================
   */
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

  /*
   * =====================================================
   * CONSULTAR PEDIDO
   * =====================================================
   */
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