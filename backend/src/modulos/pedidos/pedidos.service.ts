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
  TipoEventoOperacional,
  TipoPedido,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

import { CreatePedidoDto } from './dto/create-pedido.dto';

import { AgregarDetallesPedidoDto } from './dto/agregar-detalles-pedido.dto';

import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';
import { ActualizarDomicilioDto } from './dto/actualizar-domicilio.dto';
import { ActualizarContextoPedidoDto } from './dto/actualizar-contexto-pedido.dto';
import { ActualizarDetallePedidoDto } from './dto/actualizar-detalle-pedido.dto';
import {
  hashSolicitud,
  normalizarClaveIdempotencia,
  validarReplayIdempotente,
} from '../../plataforma/idempotencia';
import {
  configuracionImpresionTermica,
  dineroTermico,
  documentoTermicoHtml,
  escaparHtml,
  fechaLocalTermica,
} from '../../plataforma/impresion-termica';

type DetalleEntrada = {
  productoId: number;
  cantidad: number;
  observaciones?: string;
  modificadorIds?: number[];
};

type DetallePreparado = {
  productoId: number;
  cantidad: number;
  precioUnitario: Prisma.Decimal;
  subtotal: Prisma.Decimal;
  observaciones: string | null;
  modificadores?: {
    create: Array<{
      modificadorId: number;
      nombre: string;
      precioUnitario: Prisma.Decimal;
      cantidad: number;
      subtotal: Prisma.Decimal;
    }>;
  };
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
      const modificadorIds = [...new Set(detalle.modificadorIds ?? [])].sort(
        (a, b) => a - b,
      );
      const clave = `${detalle.productoId}:${observaciones ?? ''}:${modificadorIds.join(',')}`;
      const existente = cantidades.get(clave);
      cantidades.set(clave, {
        productoId: detalle.productoId,
        cantidad: (existente?.cantidad ?? 0) + detalle.cantidad,
        observaciones,
        modificadorIds,
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
      include: {
        modificadores: { where: { activo: true }, orderBy: { orden: 'asc' } },
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

      if (!producto.disponible) {
        throw new BadRequestException(
          `El producto ${producto.nombre} está agotado temporalmente`,
        );
      }
      const seleccionados = [...new Set(detalle.modificadorIds ?? [])];
      const modificadores = producto.modificadores.filter((item) =>
        seleccionados.includes(item.id),
      );
      if (modificadores.length !== seleccionados.length) {
        throw new BadRequestException(
          `Uno o más modificadores no pertenecen al producto ${producto.nombre}`,
        );
      }
      const adicionalUnitario = modificadores.reduce(
        (acc, item) => acc.plus(item.precio),
        new Prisma.Decimal(0),
      );
      const precioUnitario = producto.precio.plus(adicionalUnitario);
      const subtotal = precioUnitario.mul(cantidad);

      total = total.plus(subtotal);

      detallesPreparados.push({
        productoId: producto.id,

        cantidad,

        precioUnitario,

        subtotal,

        observaciones: detalle.observaciones ?? null,
        ...(modificadores.length
          ? {
              modificadores: {
                create: modificadores.map((item) => ({
                  modificadorId: item.id,
                  nombre: item.nombre,
                  precioUnitario: item.precio,
                  cantidad,
                  subtotal: item.precio.mul(cantidad),
                })),
              },
            }
          : {}),
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

      const creado = await tx.pedido.create({
        data: {
          sucursalId: contexto.sucursalId,

          mesaId: contexto.mesaId,

          usuarioId: usuarioActual.id,
          meseroId: usuarioActual.id,

          tipo: data.tipo,

          estado: EstadoPedido.PENDIENTE,
          personas: data.personas ?? null,
          observaciones: data.observaciones?.trim() || null,

          idempotenciaClave: clave,

          idempotenciaHash: solicitudHash,

          total: preparado.total.plus(data.domicilio?.costo ?? 0),

          detalles: {
            create: preparado.detalles,
          },

          ...(contexto.mesaId
            ? {
                mesasVinculadas: {
                  create: { mesaId: contexto.mesaId, principal: true },
                },
              }
            : {}),

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
              producto: {
                include: {
                  modificadores: {
                    where: { activo: true },
                    orderBy: { orden: 'asc' },
                  },
                },
              },
              modificadores: true,
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

      await tx.eventoOperacional.create({
        data: {
          tipo: TipoEventoOperacional.PEDIDO_CREADO,
          sucursalId: creado.sucursalId,
          pedidoId: creado.id,
          actorId: usuarioActual.id,
          metadata: { tipoPedido: creado.tipo, mesaId: creado.mesaId },
        },
      });

      return creado;
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
              producto: {
                include: {
                  modificadores: {
                    where: { activo: true },
                    orderBy: { orden: 'asc' },
                  },
                },
              },
              modificadores: true,
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
  async actualizarDetalle(
    pedidoId: number,
    detalleId: number,
    data: ActualizarDetallePedidoDto,
    usuarioActual: UsuarioAutenticado,
  ) {
    if (data.cantidad === undefined && data.observaciones === undefined) {
      throw new BadRequestException('No hay cambios para aplicar');
    }
    return this.prisma.transaccionSerializable(async (tx) => {
      const pedido = await tx.pedido.findFirst({
        where: { id: pedidoId, sucursal: this.filtroSucursal(usuarioActual) },
        include: {
          venta: { select: { id: true } },
          factura: { select: { id: true } },
        },
      });
      if (!pedido) throw new NotFoundException('Pedido no encontrado');
      if (
        pedido.venta ||
        pedido.factura ||
        pedido.estado === EstadoPedido.CANCELADO ||
        pedido.estado === EstadoPedido.FACTURADO
      ) {
        throw new BadRequestException(
          'La cuenta ya no admite cambios en sus líneas',
        );
      }
      const detalle = await tx.detallePedido.findFirst({
        where: { id: detalleId, pedidoId },
        include: {
          comandas: { include: { comanda: true } },
          modificadores: true,
        },
      });
      if (!detalle)
        throw new NotFoundException('Línea de pedido no encontrada');
      if (
        detalle.comandas.some(
          (item) => item.comanda.estado !== EstadoComanda.CANCELADA,
        )
      ) {
        throw new BadRequestException(
          'Una línea enviada a preparación no se modifica; agrega una nueva línea o gestiona la corrección en cocina',
        );
      }
      const cantidad = data.cantidad ?? detalle.cantidad;
      const subtotalAnterior = detalle.subtotal;
      const subtotalNuevo = detalle.precioUnitario.mul(cantidad);
      await tx.detallePedido.update({
        where: { id: detalle.id },
        data: {
          cantidad,
          subtotal: subtotalNuevo,
          ...(data.observaciones !== undefined
            ? { observaciones: data.observaciones.trim() || null }
            : {}),
        },
      });
      for (const modificador of detalle.modificadores) {
        await tx.detallePedidoModificador.update({
          where: { id: modificador.id },
          data: {
            cantidad,
            subtotal: modificador.precioUnitario.mul(cantidad),
          },
        });
      }
      await tx.pedido.update({
        where: { id: pedido.id },
        data: { total: { increment: subtotalNuevo.minus(subtotalAnterior) } },
      });
      return { pedidoId, detalleId, cantidad, subtotal: subtotalNuevo };
    });
  }

  async actualizarContexto(
    pedidoId: number,
    data: ActualizarContextoPedidoDto,
    usuarioActual: UsuarioAutenticado,
  ) {
    const pedido = await this.prisma.pedido.findFirst({
      where: { id: pedidoId, sucursal: this.filtroSucursal(usuarioActual) },
      select: { id: true, estado: true },
    });
    if (!pedido) throw new NotFoundException('Pedido no encontrado');
    if (
      pedido.estado === EstadoPedido.CANCELADO ||
      pedido.estado === EstadoPedido.FACTURADO
    ) {
      throw new BadRequestException(
        'El pedido ya no admite cambios de contexto',
      );
    }
    return this.prisma.pedido.update({
      where: { id: pedido.id },
      data: {
        ...(data.personas !== undefined ? { personas: data.personas } : {}),
        ...(data.observaciones !== undefined
          ? { observaciones: data.observaciones.trim() || null }
          : {}),
      },
      select: { id: true, personas: true, observaciones: true },
    });
  }

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
        const vinculadas = await tx.pedidoMesa.findMany({
          where: { pedidoId: pedido.id },
          select: { mesaId: true },
        });
        await tx.mesa.updateMany({
          where: {
            id: { in: vinculadas.map((item) => item.mesaId) },
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
              producto: {
                include: {
                  modificadores: {
                    where: { activo: true },
                    orderBy: { orden: 'asc' },
                  },
                },
              },
              modificadores: true,
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

  private async pedidoMesaActivo(
    tx: Prisma.TransactionClient,
    pedidoId: number,
    usuarioActual: UsuarioAutenticado,
  ) {
    const pedido = await tx.pedido.findFirst({
      where: {
        id: pedidoId,
        tipo: TipoPedido.MESA,
        estado: { notIn: [EstadoPedido.CANCELADO, EstadoPedido.FACTURADO] },
        sucursal: this.filtroSucursal(usuarioActual),
      },
      include: { mesasVinculadas: true, sucursal: true },
    });
    if (!pedido)
      throw new NotFoundException('Servicio de mesa activo no encontrado');
    if (
      pedido.mesaId &&
      !pedido.mesasVinculadas.some((item) => item.mesaId === pedido.mesaId)
    ) {
      await tx.pedidoMesa.create({
        data: { pedidoId, mesaId: pedido.mesaId, principal: true },
      });
      pedido.mesasVinculadas.push({
        pedidoId,
        mesaId: pedido.mesaId,
        principal: true,
        vinculadaEn: new Date(),
      });
    }
    return pedido;
  }

  unirMesas(
    pedidoId: number,
    mesaIds: number[],
    usuarioActual: UsuarioAutenticado,
  ) {
    this.validarCapacidadMesas(usuarioActual);
    return this.prisma.transaccionSerializable(async (tx) => {
      const pedido = await this.pedidoMesaActivo(tx, pedidoId, usuarioActual);
      const nuevas = [...new Set(mesaIds)].filter(
        (id) => !pedido.mesasVinculadas.some((item) => item.mesaId === id),
      );
      if (!nuevas.length)
        throw new BadRequestException('Las mesas ya están vinculadas');
      const mesas = await tx.mesa.findMany({
        where: {
          id: { in: nuevas },
          estado: true,
          situacion: EstadoMesa.LIBRE,
          zona: { sucursalId: pedido.sucursalId },
        },
      });
      if (mesas.length !== nuevas.length)
        throw new BadRequestException(
          'Todas las mesas a unir deben estar libres y pertenecer a la sede',
        );
      await tx.mesa.updateMany({
        where: { id: { in: nuevas }, situacion: EstadoMesa.LIBRE },
        data: { situacion: EstadoMesa.OCUPADA, ocupacionManual: false },
      });
      await tx.pedidoMesa.createMany({
        data: nuevas.map((mesaId) => ({ pedidoId, mesaId, principal: false })),
      });
      return tx.pedido.findUniqueOrThrow({
        where: { id: pedidoId },
        include: {
          mesa: { include: { zona: true } },
          mesasVinculadas: { include: { mesa: { include: { zona: true } } } },
          mesero: { select: { id: true, nombres: true, apellidos: true } },
        },
      });
    });
  }

  trasladarMesa(
    pedidoId: number,
    mesaDestinoId: number,
    usuarioActual: UsuarioAutenticado,
  ) {
    this.validarCapacidadMesas(usuarioActual);
    return this.prisma.transaccionSerializable(async (tx) => {
      const pedido = await this.pedidoMesaActivo(tx, pedidoId, usuarioActual);
      if (!pedido.mesaId)
        throw new BadRequestException('El pedido no tiene mesa principal');
      if (pedido.mesaId === mesaDestinoId)
        throw new BadRequestException('La mesa destino ya es la principal');
      const destino = await tx.mesa.findFirst({
        where: {
          id: mesaDestinoId,
          estado: true,
          situacion: EstadoMesa.LIBRE,
          zona: { sucursalId: pedido.sucursalId },
        },
      });
      if (!destino)
        throw new BadRequestException(
          'La mesa destino no está libre o no pertenece a la sede',
        );
      const anteriorId = pedido.mesaId;
      await tx.mesa.update({
        where: { id: destino.id },
        data: { situacion: EstadoMesa.OCUPADA, ocupacionManual: false },
      });
      await tx.mesa.update({
        where: { id: anteriorId },
        data: {
          situacion: EstadoMesa.LIBRE,
          ocupacionManual: false,
          ocupadaManualEn: null,
          ocupadaManualPorId: null,
        },
      });
      await tx.pedidoMesa.deleteMany({
        where: { pedidoId, mesaId: anteriorId },
      });
      await tx.pedidoMesa.upsert({
        where: { pedidoId_mesaId: { pedidoId, mesaId: destino.id } },
        create: { pedidoId, mesaId: destino.id, principal: true },
        update: { principal: true },
      });
      await tx.pedidoMesa.updateMany({
        where: { pedidoId, mesaId: { not: destino.id } },
        data: { principal: false },
      });
      return tx.pedido.update({
        where: { id: pedidoId },
        data: { mesaId: destino.id },
        include: {
          mesa: { include: { zona: true } },
          mesasVinculadas: { include: { mesa: true } },
        },
      });
    });
  }

  separarMesa(
    pedidoId: number,
    mesaId: number,
    usuarioActual: UsuarioAutenticado,
  ) {
    return this.prisma.transaccionSerializable(async (tx) => {
      const pedido = await this.pedidoMesaActivo(tx, pedidoId, usuarioActual);
      if (pedido.mesaId === mesaId)
        throw new BadRequestException(
          'Traslada primero la mesa principal; sólo se separan mesas secundarias',
        );
      const vinculo = pedido.mesasVinculadas.find(
        (item) => item.mesaId === mesaId,
      );
      if (!vinculo)
        throw new NotFoundException('La mesa no está unida a este servicio');
      await tx.pedidoMesa.delete({
        where: { pedidoId_mesaId: { pedidoId, mesaId } },
      });
      await tx.mesa.update({
        where: { id: mesaId },
        data: {
          situacion: EstadoMesa.LIBRE,
          ocupacionManual: false,
          ocupadaManualEn: null,
          ocupadaManualPorId: null,
        },
      });
      return { pedidoId, mesaId, separada: true };
    });
  }

  cambiarMesero(
    pedidoId: number,
    meseroId: number,
    usuarioActual: UsuarioAutenticado,
  ) {
    return this.prisma.transaccionSerializable(async (tx) => {
      const pedido = await this.pedidoMesaActivo(tx, pedidoId, usuarioActual);
      const mesero = await tx.usuario.findFirst({
        where: {
          id: meseroId,
          activo: true,
          restauranteId: pedido.sucursal.restauranteId,
          OR: [{ sucursalId: null }, { sucursalId: pedido.sucursalId }],
        },
        select: { id: true, nombres: true, apellidos: true },
      });
      if (!mesero)
        throw new NotFoundException(
          'Mesero activo no encontrado en el restaurante',
        );
      await tx.pedido.update({
        where: { id: pedidoId },
        data: { meseroId: mesero.id },
      });
      return { pedidoId, mesero };
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
        mesero: { select: { id: true, nombres: true, apellidos: true } },
        mesasVinculadas: { include: { mesa: { include: { zona: true } } } },

        detalles: {
          include: {
            producto: {
              include: {
                modificadores: {
                  where: { activo: true },
                  orderBy: { orden: 'asc' },
                },
              },
            },
            modificadores: true,
            comandas: { include: { comanda: { include: { estacion: true } } } },
          },
        },

        comandas: {
          include: {
            estacion: true,
            detalles: {
              include: { detallePedido: { include: { producto: true } } },
            },
          },
          orderBy: { fechaEnvio: 'asc' },
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

  async marcarEntregado(pedidoId: number, usuarioActual: UsuarioAutenticado) {
    return this.prisma.transaccionSerializable(async (tx) => {
      const pedido = await tx.pedido.findFirst({
        where: { id: pedidoId, sucursal: this.filtroSucursal(usuarioActual) },
        include: {
          comandas: { where: { estado: { not: EstadoComanda.CANCELADA } } },
        },
      });
      if (!pedido) throw new NotFoundException('Pedido no encontrado');
      if (pedido.estado === EstadoPedido.ENTREGADO) return pedido;
      if (pedido.estado !== EstadoPedido.LISTO) {
        throw new BadRequestException(
          'El pedido debe estar listo antes de marcarlo entregado al cliente',
        );
      }
      if (
        !pedido.comandas.length ||
        pedido.comandas.some((item) => item.estado !== EstadoComanda.ENTREGADA)
      ) {
        throw new BadRequestException(
          'Todas las comandas deben haber sido retiradas de sus estaciones',
        );
      }
      const actualizado = await tx.pedido.update({
        where: { id: pedido.id },
        data: { estado: EstadoPedido.ENTREGADO },
        include: { mesa: true, comandas: { include: { estacion: true } } },
      });
      await tx.eventoOperacional.create({
        data: {
          tipo: TipoEventoOperacional.ENTREGADO_CLIENTE,
          sucursalId: pedido.sucursalId,
          pedidoId: pedido.id,
          actorId: usuarioActual.id,
          metadata: { mesaId: pedido.mesaId, tipoPedido: pedido.tipo },
        },
      });
      return actualizado;
    });
  }

  async trazabilidad(pedidoId: number, usuarioActual: UsuarioAutenticado) {
    const pedido = await this.prisma.pedido.findFirst({
      where: { id: pedidoId, sucursal: this.filtroSucursal(usuarioActual) },
      select: { id: true },
    });
    if (!pedido) throw new NotFoundException('Pedido no encontrado');
    return this.prisma.eventoOperacional.findMany({
      where: { pedidoId },
      include: {
        actor: { select: { id: true, nombres: true, apellidos: true } },
        comanda: {
          include: {
            estacion: { select: { id: true, nombre: true, codigo: true } },
          },
        },
        venta: { select: { id: true, estado: true, total: true } },
      },
      orderBy: { ocurridoEn: 'asc' },
    });
  }

  async solicitarCuenta(pedidoId: number, usuarioActual: UsuarioAutenticado) {
    return this.prisma.transaccionSerializable(async (tx) => {
      const pedido = await tx.pedido.findFirst({
        where: { id: pedidoId, sucursal: this.filtroSucursal(usuarioActual) },
        include: {
          venta: { select: { id: true, estado: true } },
          mesasVinculadas: true,
        },
      });
      if (!pedido) throw new NotFoundException('Pedido no encontrado');
      if (!pedido.venta)
        throw new BadRequestException(
          'Genera primero la venta preliminar del pedido',
        );
      if (pedido.venta.estado === 'ANULADA')
        throw new BadRequestException('La venta asociada está anulada');
      const cuentaRegistrada = await tx.eventoOperacional.findFirst({
        where: {
          pedidoId: pedido.id,
          tipo: TipoEventoOperacional.CUENTA_SOLICITADA,
        },
        select: { id: true },
      });
      if (!cuentaRegistrada) {
        await tx.eventoOperacional.create({
          data: {
            tipo: TipoEventoOperacional.CUENTA_SOLICITADA,
            sucursalId: pedido.sucursalId,
            pedidoId: pedido.id,
            ventaId: pedido.venta.id,
            actorId: usuarioActual.id,
          },
        });
      }
      const mesaIds = [
        ...new Set(
          [
            pedido.mesaId,
            ...pedido.mesasVinculadas.map((item) => item.mesaId),
          ].filter((id): id is number => id !== null),
        ),
      ];
      if (mesaIds.length) {
        await tx.mesa.updateMany({
          where: {
            id: { in: mesaIds },
            situacion: { in: [EstadoMesa.OCUPADA, EstadoMesa.PENDIENTE_PAGO] },
          },
          data: { situacion: EstadoMesa.PENDIENTE_PAGO },
        });
      }
      return {
        pedidoId,
        ventaId: pedido.venta.id,
        mesas: mesaIds,
        cuentaSolicitada: true,
      };
    });
  }

  async finalizarServicio(pedidoId: number, usuarioActual: UsuarioAutenticado) {
    return this.prisma.transaccionSerializable(async (tx) => {
      const pedido = await tx.pedido.findFirst({
        where: { id: pedidoId, sucursal: this.filtroSucursal(usuarioActual) },
        include: {
          venta: { select: { estado: true } },
          mesa: true,
          mesasVinculadas: true,
        },
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
        const posterior = await tx.pedido.findFirst({
          where: { mesaId: pedido.mesaId, id: { gt: pedido.id } },
          select: { id: true },
        });
        if (posterior || pedido.mesa?.ocupacionManual) {
          throw new BadRequestException(
            'La mesa ya pertenece a otra ocupación',
          );
        }
        const mesaIds = [
          ...new Set([
            pedido.mesaId,
            ...pedido.mesasVinculadas.map((item) => item.mesaId),
          ]),
        ];
        await tx.mesa.updateMany({
          where: { id: { in: mesaIds } },
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
    const puedeSupervisar = usuarioActual.permisos.includes(
      'DOMICILIOS_SUPERVISAR',
    );
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
        ...(!puedeSupervisar ? { repartidorId: usuarioActual.id } : {}),
      },
      include: {
        repartidor: { select: { id: true, nombres: true, apellidos: true } },
        pedido: { include: { detalles: { include: { producto: true } } } },
      },
      orderBy: { creadoEn: 'asc' },
      take: 200,
    });
  }

  listarRepartidores(usuarioActual: UsuarioAutenticado) {
    if (!usuarioActual.restauranteId) return [];
    return this.prisma.usuario.findMany({
      where: {
        activo: true,
        restauranteId: usuarioActual.restauranteId,
        OR: usuarioActual.sucursalId
          ? [{ sucursalId: null }, { sucursalId: usuarioActual.sucursalId }]
          : undefined,
        rol: { nombre: { equals: 'DOMICILIARIO', mode: 'insensitive' } },
      },
      select: { id: true, nombres: true, apellidos: true, sucursalId: true },
      orderBy: [{ nombres: 'asc' }, { apellidos: 'asc' }],
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
      const puedeSupervisar = usuarioActual.permisos.includes(
        'DOMICILIOS_SUPERVISAR',
      );
      if (!puedeSupervisar && domicilio.repartidorId !== usuarioActual.id) {
        throw new ForbiddenException(
          'El domicilio no está asignado a este repartidor',
        );
      }
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
      if (
        !puedeSupervisar &&
        !(
          [
            EstadoDomicilio.ASIGNADO,
            EstadoDomicilio.EN_RUTA,
          ] as EstadoDomicilio[]
        ).includes(domicilio.estado)
      ) {
        throw new BadRequestException(
          'El repartidor sólo puede operar entregas previamente asignadas',
        );
      }
      if (!puedeSupervisar && data.estado === EstadoDomicilio.CANCELADO) {
        throw new ForbiddenException(
          'Cancelar o reasignar un domicilio requiere un perfil supervisor',
        );
      }
      if (!permitidas[domicilio.estado].includes(data.estado)) {
        throw new BadRequestException(
          `Transición de domicilio no permitida: ${domicilio.estado} -> ${data.estado}`,
        );
      }
      let repartidorId = domicilio.repartidorId;
      if (data.estado === EstadoDomicilio.ASIGNADO && puedeSupervisar) {
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
        mesero: { select: { id: true, nombres: true, apellidos: true } },
        mesasVinculadas: { include: { mesa: { include: { zona: true } } } },

        detalles: {
          include: {
            producto: {
              include: {
                modificadores: {
                  where: { activo: true },
                  orderBy: { orden: 'asc' },
                },
              },
            },
            modificadores: true,

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

  async representacionPrecuenta(id: number, usuarioActual: UsuarioAutenticado) {
    const pedido = await this.prisma.pedido.findFirst({
      where: { id, sucursal: this.filtroSucursal(usuarioActual) },
      include: {
        sucursal: { include: { restaurante: true } },
        mesa: { include: { zona: true } },
        mesero: { select: { nombres: true, apellidos: true } },
        domicilio: true,
        detalles: { include: { producto: true, modificadores: true } },
        venta: true,
      },
    });
    if (!pedido) throw new NotFoundException('Pedido no encontrado');
    const cfg = await configuracionImpresionTermica(
      this.prisma,
      pedido.sucursal.restauranteId,
      pedido.sucursalId,
    );
    const esc = escaparHtml;
    const destino = pedido.mesa
      ? `Mesa ${esc(pedido.mesa.numero)}${pedido.mesa.zona?.nombre ? ` · ${esc(pedido.mesa.zona.nombre)}` : ''}`
      : pedido.tipo.replaceAll('_', ' ');
    const filas = pedido.detalles
      .map((d) => {
        const mods = d.modificadores.length
          ? `<div class="mods muted">${d.modificadores.map((m) => `+ ${esc(m.nombre)}${Number(m.precioUnitario) ? ` (${dineroTermico(m.subtotal, cfg.moneda)})` : ''}`).join('<br>')}</div>`
          : '';
        const nota = d.observaciones
          ? `<div class="note muted">OBS: ${esc(d.observaciones)}</div>`
          : '';
        return `<div class="line"><div class="row"><span>${d.cantidad}× ${esc(d.producto.nombre)}</span><strong>${dineroTermico(d.subtotal, cfg.moneda)}</strong></div>${mods}${nota}</div>`;
      })
      .join('');
    const domicilio = pedido.domicilio?.costo
      ? Number(pedido.domicilio.costo)
      : 0;
    const total = pedido.venta?.total ?? pedido.total;
    const cuerpo = `<div class="center"><div class="title">PRECUENTA</div><div class="badge">NO ES FACTURA</div><p>${esc(pedido.sucursal.restaurante.nombre)}<br>${esc(pedido.sucursal.nombre)}</p></div><hr class="sep"><div class="row"><span>${esc(destino)}</span><strong>Pedido #${pedido.id}</strong></div><div class="row"><span>Fecha</span><strong>${esc(fechaLocalTermica(pedido.creadoEn, cfg.zonaHoraria))}</strong></div>${pedido.mesero ? `<div class="row"><span>Mesero</span><strong>${esc(`${pedido.mesero.nombres} ${pedido.mesero.apellidos}`.trim())}</strong></div>` : ''}<hr class="sep">${filas}<hr class="sep">${domicilio > 0 ? `<div class="row"><span>Domicilio</span><strong>${dineroTermico(domicilio, cfg.moneda)}</strong></div>` : ''}<div class="row total"><span>TOTAL</span><span>${dineroTermico(total, cfg.moneda)}</span></div><hr class="sep"><div class="center muted">Documento informativo previo al cobro. No constituye factura ni comprobante de pago.</div>`;
    return {
      tipo: 'PRECUENTA',
      pedidoId: pedido.id,
      anchoPapel: cfg.ancho,
      mediaType: 'text/html; charset=utf-8',
      contenido: documentoTermicoHtml({
        titulo: `Precuenta ${pedido.id}`,
        ancho: cfg.ancho,
        cuerpo,
      }),
    };
  }
}
