import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProductoDto } from './dto/create-producto.dto';

@Injectable()
export class ProductosService {
  constructor(private prisma: PrismaService) {}

  async create(data: CreateProductoDto) {
    const categoriaExiste = await this.prisma.categoria.findUnique({
      where: { id: data.categoriaId },
    });
    
    if (!categoriaExiste) {
      throw new NotFoundException(`La categoría con ID ${data.categoriaId} no existe.`);
    }

    return this.prisma.producto.create({ data });
  }
}