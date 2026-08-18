import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  EstadoComanda,
  EstadoPedido,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

import { CrearComandaDto } from './dto/crear-comanda.dto';

import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';

@Injectable()
export class ComandasService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  private esSuperadmin(
    usuario: UsuarioAutenticado,
  ) {
    return usuario.restauranteId === null;
  }

  private filtroSucursal(
    usuario: UsuarioAutenticado,
  ): Prisma.SucursalWhereInput {
    return {
      estado: true,

      restaurante: {
        estado: true,
      },

      ...(!this.esSuperadmin(usuario)
        ? {
            restauranteId:
              usuario.restauranteId!,
          }
        : {}),

      ...(usuario.sucursalId !== null
        ? {
            id: usuario.sucursalId,
          }
        : {}),
    };
  }

  private filtroPedido(
    usuario: UsuarioAutenticado,
  ): Prisma.PedidoWhereInput {
    return {
      sucursal:
        this.filtroSucursal(usuario),
    };
  }

  async crear(
    pedidoId: number,
    data: CrearComandaDto,
    usuario: UsuarioAutenticado,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const pedido =
          await tx.pedido.findFirst({
            where: {
              id: pedidoId,

              ...this.filtroPedido(
                usuario,
              ),
            },

            include: {
              detalles: true,
            },
          });

        if (!pedido) {
          throw new NotFoundException(
            'Pedido no encontrado',
          );
        }

        if (
          pedido.estado ===
            EstadoPedido.CANCELADO ||
          pedido.estado ===
            EstadoPedido.FACTURADO ||
          pedido.estado ===
            EstadoPedido.ENTREGADO
        ) {
          throw new BadRequestException(
            'El pedido ya no admite nuevas comandas',
          );
        }

        /*
         * Agrupar por detallePedidoId.
         *
         * También evita errores si el cliente HTTP
         * repite accidentalmente el mismo detalle.
         */
        const solicitados =
          new Map<number, number>();

        for (const item of data.detalles) {
          solicitados.set(
            item.detallePedidoId,

            (solicitados.get(
              item.detallePedidoId,
            ) ?? 0) + item.cantidad,
          );
        }

        const idsDetalles = [
          ...solicitados.keys(),
        ];

        const detallesPedido =
          new Map(
            pedido.detalles.map(
              (detalle) => [
                detalle.id,
                detalle,
              ],
            ),
          );

        for (const id of idsDetalles) {
          if (!detallesPedido.has(id)) {
            throw new BadRequestException(
              `El detalle ${id} no pertenece al pedido`,
            );
          }
        }

        /*
         * Obtener cantidades ya enviadas mediante
         * comandas que siguen siendo válidas.
         *
         * Las comandas CANCELADAS no cuentan.
         */
        const enviados =
          await tx.detalleComanda.findMany({
            where: {
              detallePedidoId: {
                in: idsDetalles,
              },

              comanda: {
                pedidoId:
                  pedido.id,

                estado: {
                  not:
                    EstadoComanda.CANCELADA,
                },
              },
            },

            select: {
              detallePedidoId: true,
              cantidad: true,
            },
          });

        const cantidadesEnviadas =
          new Map<number, number>();

        for (const detalle of enviados) {
          cantidadesEnviadas.set(
            detalle.detallePedidoId,

            (cantidadesEnviadas.get(
              detalle.detallePedidoId,
            ) ?? 0) +
              detalle.cantidad,
          );
        }

        const detallesComanda: {
          detallePedidoId: number;
          cantidad: number;
        }[] = [];

        for (
          const [
            detallePedidoId,
            cantidadSolicitada,
          ] of solicitados
        ) {
          const detallePedido =
            detallesPedido.get(
              detallePedidoId,
            )!;

          const yaEnviado =
            cantidadesEnviadas.get(
              detallePedidoId,
            ) ?? 0;

          const disponible =
            detallePedido.cantidad -
            yaEnviado;

          if (
            cantidadSolicitada >
            disponible
          ) {
            throw new BadRequestException(
              `El detalle ${detallePedidoId} solo tiene ${disponible} unidad(es) pendientes de enviar a cocina`,
            );
          }

          detallesComanda.push({
            detallePedidoId,
            cantidad:
              cantidadSolicitada,
          });
        }

        return tx.comanda.create({
          data: {
            pedidoId:
              pedido.id,

            detalles: {
              create:
                detallesComanda,
            },
          },

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

            pedido: {
              include: {
                mesa: true,
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

  listarKds(
    usuario: UsuarioAutenticado,
  ) {
    return this.prisma.comanda.findMany({
      where: {
        estado: {
          in: [
            EstadoComanda.PENDIENTE,
            EstadoComanda.EN_PREPARACION,
            EstadoComanda.LISTA,
          ],
        },

        pedido: {
          ...this.filtroPedido(
            usuario,
          ),
        },
      },

      include: {
        pedido: {
          include: {
            mesa: {
              include: {
                zona: true,
              },
            },
          },
        },

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
    });
  }

  async actualizarEstado(
    id: number,
    nuevoEstado: EstadoComanda,
    usuario: UsuarioAutenticado,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const comanda =
          await tx.comanda.findFirst({
            where: {
              id,

              pedido: {
                ...this.filtroPedido(
                  usuario,
                ),
              },
            },
          });

        if (!comanda) {
          throw new NotFoundException(
            'Comanda no encontrada',
          );
        }

        this.validarTransicion(
          comanda.estado,
          nuevoEstado,
        );

        const ahora =
          new Date();

        const data:
          Prisma.ComandaUpdateInput = {
          estado:
            nuevoEstado,
        };

        if (
          nuevoEstado ===
          EstadoComanda.EN_PREPARACION
        ) {
          data.fechaInicio = ahora;
        }

        if (
          nuevoEstado ===
          EstadoComanda.LISTA
        ) {
          data.fechaLista = ahora;
        }

        if (
          nuevoEstado ===
          EstadoComanda.ENTREGADA
        ) {
          data.fechaEntrega = ahora;
        }

        const actualizada =
          await tx.comanda.update({
            where: {
              id:
                comanda.id,
            },

            data,

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
          });

        await this.sincronizarPedido(
          tx,
          comanda.pedidoId,
        );

        return actualizada;
      },

      {
        isolationLevel:
          Prisma.TransactionIsolationLevel
            .Serializable,
      },
    );
  }

  private validarTransicion(
    actual: EstadoComanda,
    siguiente: EstadoComanda,
  ) {
    const permitidas:
      Record<
        EstadoComanda,
        EstadoComanda[]
      > = {
        PENDIENTE: [
          EstadoComanda.EN_PREPARACION,
          EstadoComanda.CANCELADA,
        ],

        EN_PREPARACION: [
          EstadoComanda.LISTA,
        ],

        LISTA: [
          EstadoComanda.ENTREGADA,
        ],

        ENTREGADA: [],

        CANCELADA: [],
      };

    if (
      !permitidas[actual].includes(
        siguiente,
      )
    ) {
      throw new BadRequestException(
        `Transición de comanda no permitida: ${actual} -> ${siguiente}`,
      );
    }
  }

  private async sincronizarPedido(
    tx: Prisma.TransactionClient,
    pedidoId: number,
  ) {
    const pedido =
      await tx.pedido.findUnique({
        where: {
          id: pedidoId,
        },

        include: {
          detalles: true,

          comandas: {
            where: {
              estado: {
                not:
                  EstadoComanda.CANCELADA,
              },
            },

            include: {
              detalles: true,
            },
          },
        },
      });

    if (!pedido) {
      return;
    }

    /*
     * Estados terminales comerciales/operativos
     * no deben ser sobrescritos por KDS.
     */
    if (
      pedido.estado ===
        EstadoPedido.CANCELADO ||
      pedido.estado ===
        EstadoPedido.FACTURADO
    ) {
      return;
    }

    if (pedido.comandas.length === 0) {
      await tx.pedido.update({
        where: {
          id:
            pedido.id,
        },

        data: {
          estado:
            EstadoPedido.PENDIENTE,
        },
      });

      return;
    }

    const enviados =
      new Map<number, number>();

    for (
      const comanda of pedido.comandas
    ) {
      for (
        const detalle of comanda.detalles
      ) {
        enviados.set(
          detalle.detallePedidoId,

          (enviados.get(
            detalle.detallePedidoId,
          ) ?? 0) +
            detalle.cantidad,
        );
      }
    }

    const todoEnviado =
      pedido.detalles.every(
        (detalle) =>
          (enviados.get(
            detalle.id,
          ) ?? 0) >=
          detalle.cantidad,
      );

    const estados =
      pedido.comandas.map(
        (comanda) =>
          comanda.estado,
      );

    let nuevoEstado: EstadoPedido =
        EstadoPedido.PENDIENTE;

    const todasEntregadas =
      estados.every(
        (estado) =>
          estado ===
          EstadoComanda.ENTREGADA,
      );

    const todasTerminadas =
      estados.every(
        (estado) =>
          estado ===
            EstadoComanda.LISTA ||
          estado ===
            EstadoComanda.ENTREGADA,
      );

    const algunaAvanzo =
      estados.some(
        (estado) =>
          estado ===
            EstadoComanda.EN_PREPARACION ||
          estado ===
            EstadoComanda.LISTA ||
          estado ===
            EstadoComanda.ENTREGADA,
      );

    if (
      todoEnviado &&
      todasEntregadas
    ) {
      nuevoEstado =
        EstadoPedido.ENTREGADO;
    } else if (
      todoEnviado &&
      todasTerminadas
    ) {
      nuevoEstado =
        EstadoPedido.LISTO;
    } else if (algunaAvanzo) {
      nuevoEstado =
        EstadoPedido.EN_PREPARACION;
    }

    if (
      pedido.estado !==
      nuevoEstado
    ) {
      await tx.pedido.update({
        where: {
          id:
            pedido.id,
        },

        data: {
          estado:
            nuevoEstado,
        },
      });
    }
  }
}