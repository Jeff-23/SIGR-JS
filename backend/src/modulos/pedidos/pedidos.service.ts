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

@Injectable()
export class PedidosService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreatePedidoDto, usuarioId: number) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Buscar la mesa y determinar automáticamente su sucursal.
      const mesa = await tx.mesa.findUnique({
        where: { id: data.mesaId },
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

      if (mesa.situacion !== EstadoMesa.LIBRE) {
        throw new BadRequestException(
          'La mesa ya está ocupada o no está disponible',
        );
      }

      const sucursalId = mesa.zona.sucursalId;

      // 2. Comprobar que el usuario existe y está activo.
      const usuario = await tx.usuario.findUnique({
        where: { id: usuarioId },
        select: {
          id: true,
          activo: true,
          sucursalId: true,
        },
      });

      if (!usuario) {
        throw new NotFoundException('Usuario no encontrado');
      }

      if (!usuario.activo) {
        throw new BadRequestException('El usuario está inactivo');
      }

      /*
       * Si el usuario tiene una sucursal asignada,
       * solo puede registrar pedidos para esa sucursal.
       *
       * Un usuario sin sucursal (por ejemplo el superadministrador)
       * puede operar de forma global por ahora.
       */
      if (
        usuario.sucursalId !== null &&
        usuario.sucursalId !== sucursalId
      ) {
        throw new BadRequestException(
          'El usuario no pertenece a la sucursal de esta mesa',
        );
      }

      let totalPedido = 0;

      const detallesPreparados: {
        productoId: number;
        cantidad: number;
        precioUnitario: number;
        subtotal: number;
      }[] = [];

      // 3. Procesar cada producto.
      for (const item of data.detalles) {
        const producto = await tx.producto.findUnique({
          where: { id: item.productoId },
          include: {
            categoria: {
              select: {
                sucursalId: true,
              },
            },
            recetas: true,
          },
        });

        if (!producto) {
          throw new NotFoundException(
            `El producto con ID ${item.productoId} no existe`,
          );
        }

        // Evitar mezclar productos entre sucursales.
        if (producto.categoria.sucursalId !== sucursalId) {
          throw new BadRequestException(
            `El producto "${producto.nombre}" no pertenece a la sucursal de la mesa`,
          );
        }

        const precioUnitario = producto.precio.toNumber();
        const subtotal = precioUnitario * item.cantidad;

        totalPedido += subtotal;

        detallesPreparados.push({
          productoId: item.productoId,
          cantidad: item.cantidad,
          precioUnitario,
          subtotal,
        });

        // 4. Descontar los ingredientes definidos en la receta.
        for (const receta of producto.recetas) {
          const cantidadADescontar =
            receta.cantidad.toNumber() * item.cantidad;

          await tx.articulo.update({
            where: { id: receta.articuloId },
            data: {
              stock: {
                decrement: cantidadADescontar,
              },
            },
          });
        }
      }

      // 5. Crear el pedido.
      const nuevoPedido = await tx.pedido.create({
        data: {
          sucursalId,
          mesaId: data.mesaId,
          usuarioId,

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

      // 6. Ocupar la mesa.
      await tx.mesa.update({
        where: { id: data.mesaId },
        data: {
          situacion: EstadoMesa.OCUPADA,
        },
      });

      return nuevoPedido;
    });
  }
}