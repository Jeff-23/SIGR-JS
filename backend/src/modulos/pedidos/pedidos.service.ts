import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePedidoDto } from './dto/create-pedido.dto';

@Injectable()
export class PedidosService {
  constructor(private prisma: PrismaService) {}

  async create(data: CreatePedidoDto) {
    // Iniciamos una transacción: Todo o nada
    return this.prisma.$transaction(async (tx) => {
      
      // 1. Verificar si la Mesa existe y está LIBRE
      const mesa = await tx.mesa.findUnique({ where: { id: data.mesaId } });
      if (!mesa) throw new NotFoundException('Mesa no encontrada');
      if (mesa.situacion !== 'LIBRE') throw new BadRequestException('La mesa ya está ocupada o inhabilitada');

      let totalPedido = 0;
      const detallesPreparados = [];

      // 2. Calcular los totales consultando el precio real
      for (const item of data.detalles) {
        const producto = await tx.producto.findUnique({ where: { id: item.productoId } });
        if (!producto) throw new NotFoundException(`El producto con ID ${item.productoId} no existe`);

        // Convertimos el Decimal de Prisma a número para la multiplicación
        const precioNum = producto.precio.toNumber();
        const subtotal = precioNum * item.cantidad;
        
        totalPedido += subtotal;

        detallesPreparados.push({
          productoId: item.productoId,
          cantidad: item.cantidad,
          subtotal: subtotal, // Prisma convertirá este número de vuelta a Decimal automáticamente
        });
      }

      // 3. Crear el Pedido y sus Detalles en cascada
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
          detalles: true, // Para devolver el recibo completo
        }
      });

      // 4. Actualizar el estado de la Mesa a OCUPADA
      await tx.mesa.update({
        where: { id: data.mesaId },
        data: { situacion: 'OCUPADA' },
      });

      return nuevoPedido;
    });
  }
}