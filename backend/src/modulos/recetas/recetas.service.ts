import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateRecetaDto } from './dto/create-receta.dto';

@Injectable()
export class RecetasService {
  constructor(private prisma: PrismaService) {}

  async create(data: CreateRecetaDto) {
    // 1. Validar existencias
    const producto = await this.prisma.producto.findUnique({ where: { id: data.productoId } });
    if (!producto) throw new NotFoundException('Producto no encontrado');

    const articulo = await this.prisma.articulo.findUnique({ where: { id: data.articuloId } });
    if (!articulo) throw new NotFoundException('Artículo no encontrado');

    // 2. Prevenir duplicados en la receta
    const existe = await this.prisma.receta.findUnique({
      where: {
        productoId_articuloId: {
          productoId: data.productoId,
          articuloId: data.articuloId,
        }
      }
    });
    
    if (existe) {
      throw new ConflictException('Este ingrediente ya está asignado a la receta del producto');
    }

    return this.prisma.receta.create({ data });
  }
}