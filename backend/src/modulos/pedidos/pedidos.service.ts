import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  EstadoComanda,
  EstadoDomicilio,
  EstadoMesa,
  EstadoPedido,
  Prisma,
  TipoPedido,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

import { CreatePedidoDto } from './dto/create-pedido.dto';

import { AgregarDetallesPedidoDto } from './dto/agregar-detalles-pedido.dto';

import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';
import { ActualizarDomicilioDto } from './dto/actualizar-domicilio.dto';
import {
  hashSolicitud,
  normalizarClaveIdempotencia,
  validarReplayIdempotente,
} from '../../plataforma/idempotencia';

type DetalleEntrada = {
  productoId: number;
  cantidad: number;
  observaciones?: string;
};

type DetallePreparado = {
  productoId: number;
  cantidad: number;
  precioUnitario: Prisma.Decimal;
  subtotal: Prisma.Decimal;
  observaciones: string | null;
};

@Injectable()
export class PedidosService {
  constructor(private readonly prisma: PrismaService) {}

  private esSuperadmin(usuarioActual: UsuarioAutenticado) {
    return (
      usuarioActual.rol === 'SUPERADMIN' && usuarioActual.restauranteId === null
    );
  }

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

  private validarCapacidadMesas(usuarioActual: UsuarioAutenticado) {
    if (this.esSuperadmin(usuarioActual)) {
      return;
    }

    if (!usuarioActual.capacidades.includes('MESAS')) {
      throw new ForbiddenException(
        'La gestion de mesas no esta incluida en el plan del restaurante',
      );
    }
  }

  private agruparCantidades(detalles: DetalleEntrada[]) {
    const cantidades = new Map<string, DetalleEntrada>();

    for (const detalle of detalles) {
      const observaciones = detalle.observaciones?.trim() || undefined;
      const clave = `${detalle.productoId}:${observaciones ?? ''}`;
      const existente = cantidades.get(clave);
      cantidades.set(clave, {
        productoId: detalle.productoId,
        cantidad: (existente?.cantidad ?? 0) + detalle.cantidad,
        observaciones,
      });
    }

    return cantidades;
  }

  private async prepararDetalles(
    tx: Prisma.TransactionClient,

    sucursalId: number,

    detalles: DetalleEntrada[],
  ): Promise<{
    total: Prisma.Decimal;

    detalles: DetallePreparado[];
  }> {
    const cantidades = this.agruparCantidades(detalles);

    const productosIds = [
      ...new Set([...cantidades.values()].map((detalle) => detalle.productoId)),
    ];

    const productos = await tx.producto.findMany({
      where: {
        id: {
          in: productosIds,
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
    });

    if (productos.length !== productosIds.length) {
      throw new NotFoundException(
        'Uno o mas productos no existen o no pertenecen a la sucursal',
      );
    }

    const productosPorId = new Map(
      productos.map((producto) => [producto.id, producto]),
    );

    let total = new Prisma.Decimal(0);

    const detallesPreparados: DetallePreparado[] = [];

    for (const detalle of cantidades.values()) {
      const { productoId, cantidad } = detalle;
      const producto = productosPorId.get(productoId);

      if (!producto) {
        throw new NotFoundException(
          `Producto con ID ${productoId} no encontrado`,
        );
      }

      const subtotal = producto.precio.mul(cantidad);

      total = total.plus(subtotal);

      detallesPreparados.push({
        productoId: producto.id,

        cantidad,

        precioUnitario: producto.precio,

        subtotal,

        observaciones: detalle.observaciones ?? null,
      });
    }

    return {
      total,

      detalles: detallesPreparados,
    };
  }

  private async resolverSucursalSinMesa(
    tx: Prisma.TransactionClient,

    data: CreatePedidoDto,

    usuarioActual: UsuarioAutenticado,
  ) {
    if (usuarioActual.sucursalId !== null) {
      if (
        data.sucursalId !== undefined &&
        data.sucursalId !== usuarioActual.sucursalId
      ) {
        throw new ForbiddenException(
          'No puedes crear pedidos en otra sucursal',
        );
      }

      const sucursal = await tx.sucursal.findFirst({
        where: {
          id: usuarioActual.sucursalId,

          ...this.filtroSucursal(usuarioActual),
        },

        select: {
          id: true,
        },
      });

      if (!sucursal) {
        throw new NotFoundException('Sucursal no encontrada');
      }

      return sucursal.id;
    }

    if (data.sucursalId === undefined) {
      throw new BadRequestException('Debe indicar la sucursal del pedido');
    }

    const sucursal = await tx.sucursal.findFirst({
      where: {
        id: data.sucursalId,

        ...this.filtroSucursal(usuarioActual),
      },

      select: {
        id: true,
      },
    });

    if (!sucursal) {
      throw new NotFoundException('Sucursal no encontrada');
    }

    return sucursal.id;
  }

  private async resolverContextoPedido(
    tx: Prisma.TransactionClient,

    data: CreatePedidoDto,

    usuarioActual: UsuarioAutenticado,
  ): Promise<{
    sucursalId: number;
    mesaId: number | null;
  }> {
    if (data.tipo === TipoPedido.DOMICILIO && !data.domicilio) {
      throw new BadRequestException(
        'Un pedido DOMICILIO requiere destinatario, teléfono, dirección y costo',
      );
    }
    if (data.tipo !== TipoPedido.DOMICILIO && data.domicilio) {
      throw new BadRequestException(
        'Los datos de domicilio sólo aplican a pedidos DOMICILIO',
      );
    }
    if (data.tipo === TipoPedido.MANUAL) {
      throw new BadRequestException(
        'Los registros manuales de cierre deben realizarse mediante el flujo de ventas manuales',
      );
    }

    if (data.tipo === TipoPedido.MESA) {
      this.validarCapacidadMesas(usuarioActual);

      if (data.mesaId === undefined) {
        throw new BadRequestException('Un pedido de tipo MESA requiere mesaId');
      }

      const mesa = await tx.mesa.findFirst({
        where: {
          id: data.mesaId,

          estado: true,

          zona: {
            estado: true,

            sucursal: {
              ...this.filtroSucursal(usuarioActual),
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
        throw new NotFoundException('Mesa no encontrada');
      }

      if (
        data.sucursalId !== undefined &&
        data.sucursalId !== mesa.zona.sucursalId
      ) {
        throw new BadRequestException(
          'La mesa no pertenece a la sucursal indicada',
        );
      }

      if (
        mesa.situacion !== EstadoMesa.LIBRE &&
        !(mesa.situacion === EstadoMesa.OCUPADA && mesa.ocupacionManual)
      ) {
        throw new BadRequestException(
          'La mesa ya esta ocupada o no esta disponible',
        );
      }

      const mesaReservada = await tx.mesa.updateMany({
        where: {
          id: mesa.id,

          estado: true,

          OR: [
            { situacion: EstadoMesa.LIBRE },
            { situacion: EstadoMesa.OCUPADA, ocupacionManual: true },
          ],
        },

        data: {
          situacion: EstadoMesa.OCUPADA,
          ocupacionManual: false,
          ocupadaManualEn: null,
          ocupadaManualPorId: null,
        },
      });

      if (mesaReservada.count !== 1) {
        throw new BadRequestException(
          'La mesa acaba de ser ocupada por otro pedido',
        );
      }

      return {
        sucursalId: mesa.zona.sucursalId,

        mesaId: mesa.id,
      };
    }

    if (data.mesaId !== undefined) {
      throw new BadRequestException(
        `Un pedido ${data.tipo} no debe tener mesaId`,
      );
    }

    const sucursalId = await this.resolverSucursalSinMesa(
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
    data: CreatePedidoDto,

    usuarioActual: UsuarioAutenticado,
    claveRecibida: string | undefined,
  ) {
    const clave = normalizarClaveIdempotencia(claveRecibida);
    const solicitudHash = hashSolicitud({ operacion: 'CREAR_PEDIDO', data });
    return this.prisma.transaccionSerializable(async (tx) => {
      const replay = await tx.pedido.findFirst({
        where: {
          idempotenciaClave: clave,
          sucursal: this.filtroSucursal(usuarioActual),
        },
        include: {
          detalles: { include: { producto: true } },
          mesa: { include: { zona: true } },
          domicilio: true,
        },
      });
      if (replay) {
        validarReplayIdempotente(replay.idempotenciaHash, solicitudHash);
        return replay;
      }

      const contexto = await this.resolverContextoPedido(
        tx,
        data,
        usuarioActual,
      );

      const preparado = await this.prepararDetalles(
        tx,
        contexto.sucursalId,
        data.detalles,
      );

      return tx.pedido.create({
        data: {
          sucursalId: contexto.sucursalId,

          mesaId: contexto.mesaId,

          usuarioId: usuarioActual.id,

          tipo: data.tipo,

          estado: EstadoPedido.PENDIENTE,

          idempotenciaClave: clave,

          idempotenciaHash: solicitudHash,

          total: preparado.total.plus(data.domicilio?.costo ?? 0),

          detalles: {
            create: preparado.detalles,
          },

          ...(data.domicilio
            ? {
                domicilio: {
                  create: {
                    destinatario: data.domicilio.destinatario.trim(),
                    telefono: data.domicilio.telefono.trim(),
                    direccion: data.domicilio.direccion.trim(),
                    referencias: data.domicilio.referencias?.trim() || null,
                    costo: data.domicilio.costo,
                  },
                },
              }
            : {}),
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
          domicilio: true,
        },
      });
    });
  }

  async agregarDetalles(
    pedidoId: number,

    data: AgregarDetallesPedidoDto,

    usuarioActual: UsuarioAutenticado,
  ) {
    return this.prisma.transaccionSerializable(async (tx) => {
      const pedido = await tx.pedido.findFirst({
        where: {
          id: pedidoId,

          sucursal: this.filtroSucursal(usuarioActual),
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
        throw new NotFoundException('Pedido no encontrado');
      }

      if (pedido.estado === EstadoPedido.CANCELADO) {
        throw new BadRequestException(
          'No se pueden agregar productos a un pedido cancelado',
        );
      }

      if (pedido.estado === EstadoPedido.FACTURADO || pedido.factura) {
        throw new BadRequestException(
          'No se pueden agregar productos a un pedido facturado',
        );
      }

      if (pedido.venta) {
        throw new BadRequestException(
          'No se pueden agregar productos despues de generar la venta del pedido',
        );
      }

      const preparado = await this.prepararDetalles(
        tx,
        pedido.sucursalId,
        data.detalles,
      );

      const estadoNuevo =
        pedido.estado === EstadoPedido.LISTO ||
        pedido.estado === EstadoPedido.ENTREGADO
          ? EstadoPedido.PENDIENTE
          : pedido.estado;

      return tx.pedido.update({
        where: {
          id: pedido.id,
        },

        data: {
          total: {
            increment: preparado.total,
          },

          estado: estadoNuevo,

          detalles: {
            create: preparado.detalles,
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
    });
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
   * - se libera la mesa
   * - Pedido pasa a CANCELADO
   *
   * Pedido no modifica inventario.
   * La afectacion de existencias corresponde
   * exclusivamente a Venta.
   */
  async cancelar(
    pedidoId: number,

    usuarioActual: UsuarioAutenticado,
  ) {
    return this.prisma.transaccionSerializable(async (tx) => {
      const pedido = await tx.pedido.findFirst({
        where: {
          id: pedidoId,

          sucursal: this.filtroSucursal(usuarioActual),
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
        },
      });

      if (!pedido) {
        throw new NotFoundException('Pedido no encontrado');
      }

      if (pedido.estado === EstadoPedido.CANCELADO) {
        throw new BadRequestException('El pedido ya esta cancelado');
      }

      if (pedido.estado === EstadoPedido.FACTURADO || pedido.factura) {
        throw new BadRequestException(
          'No se puede cancelar un pedido facturado',
        );
      }

      if (pedido.venta) {
        throw new BadRequestException(
          'No se puede cancelar el pedido despues de generar su venta',
        );
      }

      if (
        pedido.estado === EstadoPedido.EN_PREPARACION ||
        pedido.estado === EstadoPedido.LISTO ||
        pedido.estado === EstadoPedido.ENTREGADO
      ) {
        throw new BadRequestException(
          'No se puede cancelar el pedido porque su preparacion ya avanzo',
        );
      }

      const comandaAvanzada = pedido.comandas.find(
        (comanda) =>
          comanda.estado === EstadoComanda.EN_PREPARACION ||
          comanda.estado === EstadoComanda.LISTA ||
          comanda.estado === EstadoComanda.ENTREGADA,
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
          pedidoId: pedido.id,

          estado: EstadoComanda.PENDIENTE,
        },

        data: {
          estado: EstadoComanda.CANCELADA,
        },
      });

      /*
       * =================================================
       * LIBERAR MESA
       * =================================================
       *
       * Solo corresponde cuando esta mesa sigue
       * ocupada por este pedido.
       */
      if (pedido.mesaId !== null) {
        if (pedido.mesa?.situacion === EstadoMesa.PENDIENTE_PAGO) {
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
            id: pedido.mesaId,

            situacion: EstadoMesa.OCUPADA,
          },

          data: {
            situacion: EstadoMesa.LIBRE,
            ocupacionManual: false,
            ocupadaManualEn: null,
            ocupadaManualPorId: null,
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
          id: pedido.id,
        },

        data: {
          estado: EstadoPedido.CANCELADO,
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
              fechaEnvio: 'asc',
            },
          },
        },
      });
    });
  }

  findAll(usuarioActual: UsuarioAutenticado, sucursalId?: number) {
    return this.prisma.pedido.findMany({
      where: {
        sucursal: {
          ...this.filtroSucursal(usuarioActual),
          ...(sucursalId ? { id: sucursalId } : {}),
        },
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
      take: 200,
    });
  }

  async finalizarServicio(pedidoId: number, usuarioActual: UsuarioAutenticado) {
    return this.prisma.transaccionSerializable(async (tx) => {
      const pedido = await tx.pedido.findFirst({
        where: { id: pedidoId, sucursal: this.filtroSucursal(usuarioActual) },
        include: { venta: { select: { estado: true } }, mesa: true },
      });
      if (!pedido) throw new NotFoundException('Pedido no encontrado');
      if (pedido.estado !== EstadoPedido.ENTREGADO) {
        throw new BadRequestException(
          'El servicio sólo puede finalizar cuando el pedido fue entregado',
        );
      }
      if (!pedido.venta || pedido.venta.estado !== 'PAGADA') {
        throw new BadRequestException(
          'El servicio sólo puede finalizar cuando la venta está pagada',
        );
      }
      if (pedido.mesaId !== null) {
        await tx.mesa.update({
          where: { id: pedido.mesaId },
          data: {
            situacion: EstadoMesa.LIBRE,
            ocupacionManual: false,
            ocupadaManualEn: null,
            ocupadaManualPorId: null,
          },
        });
      }
      return { pedidoId, finalizado: true, mesaId: pedido.mesaId };
    });
  }

  listarDomicilios(usuarioActual: UsuarioAutenticado) {
    return this.prisma.domicilio.findMany({
      where: {
        estado: {
          in: [
            EstadoDomicilio.PENDIENTE_ASIGNACION,
            EstadoDomicilio.ASIGNADO,
            EstadoDomicilio.EN_RUTA,
            EstadoDomicilio.NO_ENTREGADO,
          ],
        },
        pedido: { sucursal: this.filtroSucursal(usuarioActual) },
      },
      include: {
        repartidor: { select: { id: true, nombres: true, apellidos: true } },
        pedido: { include: { detalles: { include: { producto: true } } } },
      },
      orderBy: { creadoEn: 'asc' },
      take: 200,
    });
  }

  async actualizarDomicilio(
    id: number,
    data: ActualizarDomicilioDto,
    usuarioActual: UsuarioAutenticado,
  ) {
    return this.prisma.transaccionSerializable(async (tx) => {
      const domicilio = await tx.domicilio.findFirst({
        where: { id, pedido: { sucursal: this.filtroSucursal(usuarioActual) } },
        include: { pedido: { include: { sucursal: true } } },
      });
      if (!domicilio) throw new NotFoundException('Domicilio no encontrado');
      const permitidas: Record<EstadoDomicilio, EstadoDomicilio[]> = {
        PENDIENTE_ASIGNACION: [
          EstadoDomicilio.ASIGNADO,
          EstadoDomicilio.CANCELADO,
        ],
        ASIGNADO: [EstadoDomicilio.EN_RUTA, EstadoDomicilio.CANCELADO],
        EN_RUTA: [EstadoDomicilio.ENTREGADO, EstadoDomicilio.NO_ENTREGADO],
        NO_ENTREGADO: [EstadoDomicilio.ASIGNADO, EstadoDomicilio.CANCELADO],
        ENTREGADO: [],
        CANCELADO: [],
      };
      if (!permitidas[domicilio.estado].includes(data.estado)) {
        throw new BadRequestException(
          `Transición de domicilio no permitida: ${domicilio.estado} -> ${data.estado}`,
        );
      }
      let repartidorId = domicilio.repartidorId;
      if (data.estado === EstadoDomicilio.ASIGNADO) {
        if (!data.repartidorId)
          throw new BadRequestException(
            'Asignar domicilio requiere repartidorId',
          );
        const repartidor = await tx.usuario.findFirst({
          where: {
            id: data.repartidorId,
            activo: true,
            restauranteId: domicilio.pedido.sucursal.restauranteId,
            OR: [
              { sucursalId: null },
              { sucursalId: domicilio.pedido.sucursalId },
            ],
          },
        });
        if (!repartidor)
          throw new NotFoundException('Repartidor no encontrado');
        repartidorId = repartidor.id;
      }
      if (data.estado === EstadoDomicilio.EN_RUTA && !repartidorId) {
        throw new BadRequestException(
          'El domicilio no tiene repartidor asignado',
        );
      }
      if (
        data.estado === EstadoDomicilio.EN_RUTA &&
        domicilio.pedido.estado !== EstadoPedido.LISTO
      ) {
        throw new BadRequestException(
          'El domicilio sólo puede salir a ruta cuando cocina entregó el pedido',
        );
      }
      const ahora = new Date();
      const actualizado = await tx.domicilio.update({
        where: { id },
        data: {
          estado: data.estado,
          repartidorId,
          observacion: data.observacion?.trim() || domicilio.observacion,
          ...(data.estado === EstadoDomicilio.ASIGNADO
            ? { asignadoEn: ahora }
            : {}),
          ...(data.estado === EstadoDomicilio.EN_RUTA
            ? { enRutaEn: ahora }
            : {}),
          ...(data.estado === EstadoDomicilio.ENTREGADO
            ? { entregadoEn: ahora }
            : {}),
        },
      });
      if (data.estado === EstadoDomicilio.ENTREGADO) {
        await tx.pedido.update({
          where: { id: domicilio.pedidoId },
          data: { estado: EstadoPedido.ENTREGADO },
        });
      }
      return actualizado;
    });
  }

  async findOne(
    id: number,

    usuarioActual: UsuarioAutenticado,
  ) {
    const pedido = await this.prisma.pedido.findFirst({
      where: {
        id,

        sucursal: this.filtroSucursal(usuarioActual),
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
      throw new NotFoundException('Pedido no encontrado');
    }

    return pedido;
  }
}
