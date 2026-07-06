import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ProductosService {
  constructor(private prisma: PrismaService) {}

  async create(data: any) {
    const categoriaExiste = await this.prisma.categoria.findUnique({
      where: { id: data.categoriaId },
    });
    
    if (!categoriaExiste) {
      throw new NotFoundException(`La categoría con ID ${data.categoriaId} no existe.`);
    }

    return this.prisma.producto.create({ data });
  }

  async findAll() {
    return this.prisma.producto.findMany({
      where: { estado: true },
      include: { recetas: true }
    });
  }

  // Permite cambiar el precio del plato al público en tiempo real
  async update(id: number, data: any) {
    const producto = await this.prisma.producto.findUnique({ where: { id } });
    if (!producto) throw new NotFoundException('Producto no encontrado');

    return this.prisma.producto.update({
      where: { id },
      data
    });
  }
}