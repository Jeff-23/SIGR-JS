import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  EstadoComanda,
  EstadoDetalleComanda,
  EstadoMesa,
  EstadoPedido,
  EstadoVenta,
  Prisma,
  PrioridadComanda,
  TipoPedido,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

import { CrearComandaDto } from './dto/crear-comanda.dto';

import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';
import {
  ActualizarEstacionDto,
  CrearEstacionDto,
} from './dto/gestionar-estacion.dto';

@Injectable()
export class ComandasService {
  constructor(private readonly prisma: PrismaService) {}

  private esSuperadmin(usuario: UsuarioAutenticado) {
    return usuario.rol === 'SUPERADMIN' && usuario.restauranteId === null;
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
            restauranteId: usuario.restauranteId,
          }
        : {}),

      ...(usuario.sucursalId !== null
        ? {
            id: usuario.sucursalId,
          }
        : {}),
    };
  }

  private filtroPedido(usuario: UsuarioAutenticado): Prisma.PedidoWhereInput {
    return {
      sucursal: this.filtroSucursal(usuario),
    };
  }

  async crear(
    pedidoId: number,
    data: CrearComandaDto,
    usuario: UsuarioAutenticado,
  ) {
    return this.prisma.transaccionSerializable(async (tx) => {
      const pedido = await tx.pedido.findFirst({
        where: {
          id: pedidoId,

          ...this.filtroPedido(usuario),
        },

        include: {
          detalles: { include: { producto: { include: { estacion: true } } } },
        },
      });

      if (!pedido) {
        throw new NotFoundException('Pedido no encontrado');
      }

      if (
        pedido.estado === EstadoPedido.CANCELADO ||
        pedido.estado === EstadoPedido.FACTURADO ||
        pedido.estado === EstadoPedido.ENTREGADO
      ) {
        throw new BadRequestException('El pedido ya no admite nuevas comandas');
      }

      /*
       * Agrupar por detallePedidoId.
       *
       * También evita errores si el cliente HTTP
       * repite accidentalmente el mismo detalle.
       */
      const solicitados = new Map<number, number>();

      for (const item of data.detalles) {
        solicitados.set(
          item.detallePedidoId,

          (solicitados.get(item.detallePedidoId) ?? 0) + item.cantidad,
        );
      }

      const idsDetalles = [...solicitados.keys()];

      const detallesPedido = new Map(
        pedido.detalles.map((detalle) => [detalle.id, detalle]),
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
      const enviados = await tx.detalleComanda.findMany({
        where: {
          detallePedidoId: {
            in: idsDetalles,
          },

          comanda: {
            pedidoId: pedido.id,

            estado: {
              not: EstadoComanda.CANCELADA,
            },
          },
        },

        select: {
          detallePedidoId: true,
          cantidad: true,
        },
      });

      const cantidadesEnviadas = new Map<number, number>();

      for (const detalle of enviados) {
        cantidadesEnviadas.set(
          detalle.detallePedidoId,

          (cantidadesEnviadas.get(detalle.detallePedidoId) ?? 0) +
            detalle.cantidad,
        );
      }

      const detallesPorEstacion = new Map<
        number,
        {
          detallePedidoId: number;
          cantidad: number;
        }[]
      >();

      const estacionPredeterminada = await tx.estacionPreparacion.upsert({
        where: {
          sucursalId_codigo: {
            sucursalId: pedido.sucursalId,
            codigo: 'COCINA',
          },
        },
        update: {},
        create: {
          sucursalId: pedido.sucursalId,
          codigo: 'COCINA',
          nombre: 'Cocina',
          color: '#F97316',
          orden: 10,
        },
        select: { id: true, estado: true, objetivoPreparacionMin: true },
      });

      for (const [detallePedidoId, cantidadSolicitada] of solicitados) {
        const detallePedido = detallesPedido.get(detallePedidoId);

        const yaEnviado = cantidadesEnviadas.get(detallePedidoId) ?? 0;

        const disponible = detallePedido.cantidad - yaEnviado;

        if (cantidadSolicitada > disponible) {
          throw new BadRequestException(
            `El detalle ${detallePedidoId} solo tiene ${disponible} unidad(es) pendientes de enviar a cocina`,
          );
        }

        const asignada = detallePedido.producto.estacion;
        const estacionId = asignada
          ? asignada.estado && asignada.sucursalId === pedido.sucursalId
            ? asignada.id
            : null
          : estacionPredeterminada.estado
            ? estacionPredeterminada.id
            : null;
        if (!estacionId) {
          throw new BadRequestException(
            `El producto ${detallePedido.productoId} no tiene estación de preparación activa`,
          );
        }
        const grupo = detallesPorEstacion.get(estacionId) ?? [];
        grupo.push({
          detallePedidoId,
          cantidad: cantidadSolicitada,
        });
        detallesPorEstacion.set(estacionId, grupo);
      }

      const comandas = [];
      for (const [estacionId, detalles] of detallesPorEstacion) {
        const estacion = await tx.estacionPreparacion.findUnique({
          where: { id: estacionId },
          select: { objetivoPreparacionMin: true },
        });
        if (!estacion) {
          throw new BadRequestException(
            'Estación de preparación no encontrada',
          );
        }
        comandas.push(
          await tx.comanda.create({
            data: {
              pedidoId: pedido.id,
              estacionId,
              metaPreparacionMin: estacion.objetivoPreparacionMin,
              detalles: { create: detalles },
            },
            include: {
              estacion: true,
              detalles: {
                include: {
                  detallePedido: {
                    include: { producto: true, modificadores: true },
                  },
                },
              },
              pedido: { include: { mesa: true, mesero: true } },
            },
          }),
        );
      }
      return { comandas };
    });
  }

  listarKds(
    usuario: UsuarioAutenticado,
    sucursalId?: number,
    estacionId?: number,
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
          ...this.filtroPedido(usuario),
          ...(sucursalId ? { sucursalId } : {}),
        },
        ...(estacionId ? { estacionId } : {}),
      },

      include: {
        estacion: true,
        pedido: {
          include: {
            mesa: {
              include: {
                zona: true,
              },
            },
            mesero: {
              select: { id: true, nombres: true, apellidos: true },
            },
          },
        },

        detalles: {
          include: {
            detallePedido: {
              include: {
                producto: true,
                modificadores: true,
              },
            },
          },
        },
      },

      orderBy: [{ prioridad: 'desc' }, { fechaEnvio: 'asc' }],
      take: 500,
    });
  }

  listarEstaciones(usuario: UsuarioAutenticado, sucursalId?: number) {
    return this.prisma.estacionPreparacion.findMany({
      where: {
        estado: true,
        sucursal: {
          AND: [
            this.filtroSucursal(usuario),
            ...(sucursalId ? [{ id: sucursalId }] : []),
          ],
        },
      },
      orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
    });
  }

  async crearEstacion(data: CrearEstacionDto, usuario: UsuarioAutenticado) {
    const sucursal = await this.prisma.sucursal.findFirst({
      where: { AND: [{ id: data.sucursalId }, this.filtroSucursal(usuario)] },
      select: { id: true },
    });
    if (!sucursal) throw new NotFoundException('Sucursal no encontrada');
    return this.prisma.estacionPreparacion.create({
      data: {
        ...data,
        codigo: data.codigo.trim().toUpperCase(),
        nombre: data.nombre.trim(),
      },
    });
  }

  async actualizarEstacion(
    id: number,
    data: ActualizarEstacionDto,
    usuario: UsuarioAutenticado,
  ) {
    const estacion = await this.prisma.estacionPreparacion.findFirst({
      where: { id, sucursal: this.filtroSucursal(usuario) },
      select: { id: true },
    });
    if (!estacion) throw new NotFoundException('Estación no encontrada');
    return this.prisma.estacionPreparacion.update({
      where: { id },
      data: { ...data, ...(data.nombre ? { nombre: data.nombre.trim() } : {}) },
    });
  }

  async marcarVista(id: number, usuario: UsuarioAutenticado) {
    const comanda = await this.prisma.comanda.findFirst({
      where: { id, pedido: this.filtroPedido(usuario) },
      select: { id: true, fechaVista: true },
    });
    if (!comanda) throw new NotFoundException('Comanda no encontrada');
    if (comanda.fechaVista) {
      return this.prisma.comanda.findUnique({
        where: { id },
        include: { estacion: true },
      });
    }
    return this.prisma.comanda.update({
      where: { id },
      data: {
        fechaVista: new Date(),
        vistoPorId: usuario.id,
      },
      include: { estacion: true },
    });
  }

  async iniciarTodos(id: number, usuario: UsuarioAutenticado) {
    return this.prisma.transaccionSerializable(async (tx) => {
      const comanda = await tx.comanda.findFirst({
        where: { id, pedido: this.filtroPedido(usuario) },
        include: { detalles: true },
      });
      if (!comanda) throw new NotFoundException('Comanda no encontrada');
      if (
        comanda.estado === EstadoComanda.LISTA ||
        comanda.estado === EstadoComanda.ENTREGADA ||
        comanda.estado === EstadoComanda.CANCELADA
      ) {
        throw new BadRequestException(
          'La comanda ya no admite iniciar preparación',
        );
      }
      const ahora = new Date();
      await tx.detalleComanda.updateMany({
        where: { comandaId: id, estado: EstadoDetalleComanda.PENDIENTE },
        data: {
          estado: EstadoDetalleComanda.EN_PREPARACION,
          fechaInicio: ahora,
        },
      });
      await tx.comanda.update({
        where: { id },
        data: {
          estado: EstadoComanda.EN_PREPARACION,
          fechaInicio: comanda.fechaInicio ?? ahora,
          fechaVista: comanda.fechaVista ?? ahora,
          vistoPorId: comanda.fechaVista ? undefined : usuario.id,
        },
      });
      await this.sincronizarPedido(tx, comanda.pedidoId);
      return tx.comanda.findUnique({
        where: { id },
        include: {
          estacion: true,
          pedido: {
            include: { mesa: { include: { zona: true } }, mesero: true },
          },
          detalles: {
            include: {
              detallePedido: {
                include: { producto: true, modificadores: true },
              },
            },
          },
        },
      });
    });
  }

  async actualizarEstadoDetalle(
    id: number,
    detalleId: number,
    nuevoEstado: EstadoDetalleComanda,
    usuario: UsuarioAutenticado,
  ) {
    return this.prisma.transaccionSerializable(async (tx) => {
      const comanda = await tx.comanda.findFirst({
        where: { id, pedido: this.filtroPedido(usuario) },
        include: { detalles: true },
      });
      if (!comanda) throw new NotFoundException('Comanda no encontrada');
      if (
        comanda.estado === EstadoComanda.ENTREGADA ||
        comanda.estado === EstadoComanda.CANCELADA
      ) {
        throw new BadRequestException(
          'La comanda ya no admite cambios de preparación',
        );
      }
      const detalle = comanda.detalles.find((item) => item.id === detalleId);
      if (!detalle)
        throw new NotFoundException('Línea de comanda no encontrada');
      const permitidas: Record<EstadoDetalleComanda, EstadoDetalleComanda[]> = {
        PENDIENTE: [EstadoDetalleComanda.EN_PREPARACION],
        EN_PREPARACION: [EstadoDetalleComanda.LISTA],
        LISTA: [],
      };
      if (
        detalle.estado !== nuevoEstado &&
        !permitidas[detalle.estado].includes(nuevoEstado)
      ) {
        throw new BadRequestException(
          `Transición de línea no permitida: ${detalle.estado} -> ${nuevoEstado}`,
        );
      }
      if (detalle.estado !== nuevoEstado) {
        const ahora = new Date();
        await tx.detalleComanda.update({
          where: { id: detalleId },
          data: {
            estado: nuevoEstado,
            ...(nuevoEstado === EstadoDetalleComanda.EN_PREPARACION
              ? { fechaInicio: ahora }
              : {}),
            ...(nuevoEstado === EstadoDetalleComanda.LISTA
              ? { fechaLista: ahora }
              : {}),
          },
        });
      }
      await this.sincronizarComandaDesdeLineas(tx, id, usuario);
      await this.sincronizarPedido(tx, comanda.pedidoId);
      return tx.comanda.findUnique({
        where: { id },
        include: {
          estacion: true,
          pedido: {
            include: { mesa: { include: { zona: true } }, mesero: true },
          },
          detalles: {
            include: {
              detallePedido: {
                include: { producto: true, modificadores: true },
              },
            },
          },
        },
      });
    });
  }

  private async sincronizarComandaDesdeLineas(
    tx: Prisma.TransactionClient,
    id: number,
    usuario: UsuarioAutenticado,
  ) {
    const comanda = await tx.comanda.findUnique({
      where: { id },
      include: { detalles: true },
    });
    if (!comanda || comanda.detalles.length === 0) return;
    const ahora = new Date();
    const todasListas = comanda.detalles.every(
      (item) => item.estado === EstadoDetalleComanda.LISTA,
    );
    const algunaIniciada = comanda.detalles.some(
      (item) => item.estado !== EstadoDetalleComanda.PENDIENTE,
    );
    const estado = todasListas
      ? EstadoComanda.LISTA
      : algunaIniciada
        ? EstadoComanda.EN_PREPARACION
        : EstadoComanda.PENDIENTE;
    await tx.comanda.update({
      where: { id },
      data: {
        estado,
        fechaVista: comanda.fechaVista ?? (algunaIniciada ? ahora : null),
        vistoPorId:
          comanda.fechaVista || !algunaIniciada ? undefined : usuario.id,
        fechaInicio: comanda.fechaInicio ?? (algunaIniciada ? ahora : null),
        fechaLista: todasListas ? (comanda.fechaLista ?? ahora) : null,
      },
    });
  }

  async actualizarPrioridad(
    id: number,
    prioridad: PrioridadComanda,
    usuario: UsuarioAutenticado,
  ) {
    const comanda = await this.prisma.comanda.findFirst({
      where: { id, pedido: this.filtroPedido(usuario) },
      select: { id: true },
    });
    if (!comanda) throw new NotFoundException('Comanda no encontrada');
    return this.prisma.comanda.update({
      where: { id },
      data: { prioridad },
      include: { estacion: true },
    });
  }

  async actualizarEstado(
    id: number,
    nuevoEstado: EstadoComanda,
    usuario: UsuarioAutenticado,
  ) {
    return this.prisma.transaccionSerializable(async (tx) => {
      const comanda = await tx.comanda.findFirst({
        where: {
          id,

          pedido: {
            ...this.filtroPedido(usuario),
          },
        },
      });

      if (!comanda) {
        throw new NotFoundException('Comanda no encontrada');
      }

      this.validarTransicion(comanda.estado, nuevoEstado);

      const ahora = new Date();

      const data: Prisma.ComandaUpdateInput = {
        estado: nuevoEstado,
      };

      if (nuevoEstado === EstadoComanda.EN_PREPARACION) {
        data.fechaInicio = comanda.fechaInicio ?? ahora;
        data.fechaVista = comanda.fechaVista ?? ahora;
        data.vistoPor = comanda.fechaVista
          ? undefined
          : { connect: { id: usuario.id } };
        await tx.detalleComanda.updateMany({
          where: { comandaId: id, estado: EstadoDetalleComanda.PENDIENTE },
          data: {
            estado: EstadoDetalleComanda.EN_PREPARACION,
            fechaInicio: ahora,
          },
        });
      }

      if (nuevoEstado === EstadoComanda.LISTA) {
        data.fechaLista = ahora;
        await tx.detalleComanda.updateMany({
          where: { comandaId: id, estado: { not: EstadoDetalleComanda.LISTA } },
          data: { estado: EstadoDetalleComanda.LISTA, fechaLista: ahora },
        });
      }

      if (nuevoEstado === EstadoComanda.ENTREGADA) {
        data.fechaEntrega = ahora;
      }

      const actualizada = await tx.comanda.update({
        where: {
          id: comanda.id,
        },

        data,

        include: {
          estacion: true,
          detalles: {
            include: {
              detallePedido: {
                include: {
                  producto: true,
                  modificadores: true,
                },
              },
            },
          },
        },
      });

      await this.sincronizarPedido(tx, comanda.pedidoId);

      return actualizada;
    });
  }

  private validarTransicion(actual: EstadoComanda, siguiente: EstadoComanda) {
    const permitidas: Record<EstadoComanda, EstadoComanda[]> = {
      PENDIENTE: [EstadoComanda.EN_PREPARACION, EstadoComanda.CANCELADA],

      EN_PREPARACION: [EstadoComanda.LISTA],

      LISTA: [EstadoComanda.ENTREGADA],

      ENTREGADA: [],

      CANCELADA: [],
    };

    if (!permitidas[actual].includes(siguiente)) {
      throw new BadRequestException(
        `Transición de comanda no permitida: ${actual} -> ${siguiente}`,
      );
    }
  }

  private async sincronizarPedido(
    tx: Prisma.TransactionClient,
    pedidoId: number,
  ) {
    const pedido = await tx.pedido.findUnique({
      where: {
        id: pedidoId,
      },

      include: {
        detalles: true,

        comandas: {
          where: {
            estado: {
              not: EstadoComanda.CANCELADA,
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
      pedido.estado === EstadoPedido.CANCELADO ||
      pedido.estado === EstadoPedido.FACTURADO
    ) {
      return;
    }

    if (pedido.comandas.length === 0) {
      await tx.pedido.update({
        where: {
          id: pedido.id,
        },

        data: {
          estado: EstadoPedido.PENDIENTE,
        },
      });

      return;
    }

    const enviados = new Map<number, number>();

    for (const comanda of pedido.comandas) {
      for (const detalle of comanda.detalles) {
        enviados.set(
          detalle.detallePedidoId,

          (enviados.get(detalle.detallePedidoId) ?? 0) + detalle.cantidad,
        );
      }
    }

    const todoEnviado = pedido.detalles.every(
      (detalle) => (enviados.get(detalle.id) ?? 0) >= detalle.cantidad,
    );

    const estados = pedido.comandas.map((comanda) => comanda.estado);

    let nuevoEstado: EstadoPedido = EstadoPedido.PENDIENTE;

    const todasEntregadas = estados.every(
      (estado) => estado === EstadoComanda.ENTREGADA,
    );

    const todasTerminadas = estados.every(
      (estado) =>
        estado === EstadoComanda.LISTA || estado === EstadoComanda.ENTREGADA,
    );

    const algunaAvanzo = estados.some(
      (estado) =>
        estado === EstadoComanda.EN_PREPARACION ||
        estado === EstadoComanda.LISTA ||
        estado === EstadoComanda.ENTREGADA,
    );

    if (todoEnviado && todasEntregadas) {
      nuevoEstado =
        pedido.tipo === TipoPedido.DOMICILIO
          ? EstadoPedido.LISTO
          : EstadoPedido.ENTREGADO;
    } else if (todoEnviado && todasTerminadas) {
      nuevoEstado = EstadoPedido.LISTO;
    } else if (algunaAvanzo) {
      nuevoEstado = EstadoPedido.EN_PREPARACION;
    }

    if (pedido.estado !== nuevoEstado) {
      await tx.pedido.update({
        where: {
          id: pedido.id,
        },

        data: {
          estado: nuevoEstado,
        },
      });
    }

    if (nuevoEstado === EstadoPedido.ENTREGADO && pedido.mesaId !== null) {
      const venta = await tx.venta.findUnique({
        where: { pedidoId: pedido.id },
        select: { estado: true },
      });
      await tx.mesa.updateMany({
        where: {
          id: pedido.mesaId,
          estado: true,
          situacion: { in: [EstadoMesa.OCUPADA, EstadoMesa.PENDIENTE_PAGO] },
        },
        data: {
          situacion:
            venta?.estado === EstadoVenta.PAGADA
              ? EstadoMesa.LIBRE
              : EstadoMesa.PENDIENTE_PAGO,
          ocupacionManual: false,
          ocupadaManualEn: null,
          ocupadaManualPorId: null,
        },
      });
    }
  }
}
