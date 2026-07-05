import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePedidoDto } from './dto/create-pedido.dto';

@Injectable()
export class PedidosService {
  constructor(private prisma: PrismaService) {}

  async create(data: CreatePedidoDto) {
    // Transacción: Todo o nada
    return this.prisma.$transaction(async (tx) => {
      
      // 1. Verificar si la Mesa existe y está LIBRE
      const mesa = await tx.mesa.findUnique({ where: { id: data.mesaId } });
      if (!mesa) throw new NotFoundException('Mesa no encontrada');
      if (mesa.situacion !== 'LIBRE') throw new BadRequestException('La mesa ya está ocupada o inhabilitada');

      let totalPedido = 0;
      const detallesPreparados = [];

      // 2. Procesar productos, calcular totales y DESCONTAR INVENTARIO
      for (const item of data.detalles) {
        // Buscamos el producto INCLUYENDO su receta
        const producto = await tx.producto.findUnique({ 
          where: { id: item.productoId },
          include: { recetas: true } // <-- Traemos los ingredientes
        });
        
        if (!producto) throw new NotFoundException(`El producto con ID ${item.productoId} no existe`);

        // Calcular costo
        const precioNum = producto.precio.toNumber();
        const subtotal = precioNum * item.cantidad;
        totalPedido += subtotal;

        detallesPreparados.push({
          productoId: item.productoId,
          cantidad: item.cantidad,
          subtotal: subtotal, 
        });

        // 3. MAGIA DEL ERP: Descontar ingredientes de la bodega
        for (const receta of producto.recetas) {
          const cantidadADescontar = receta.cantidad.toNumber() * item.cantidad;
          
          await tx.articulo.update({
            where: { id: receta.articuloId },
            data: {
              stock: {
                decrement: cantidadADescontar // Prisma resta automáticamente del valor actual
              }
            }
          });
        }
      }

      // 4. Crear el Pedido y sus Detalles
      const nuevoPedido = await tx.pedido.create({
        data: {
          mesaId: data.mesaId,
          usuarioId: data.usuarioId,
          total: totalPedido,
          detalles: {
            create: detallesPreparados,
          },
        },
        include: {
          detalles: true,
        }
      });

      // 5. Actualizar el estado de la Mesa
      await tx.mesa.update({
        where: { id: data.mesaId },
        data: { situacion: 'OCUPADA' },
      });

      return nuevoPedido;
    });
  }
}