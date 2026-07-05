import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateArticuloDto } from './dto/create-articulo.dto';

@Injectable()
export class ArticulosService {
  constructor(private prisma: PrismaService) {}

  async create(data: CreateArticuloDto) {
    const sucursal = await this.prisma.sucursal.findUnique({ where: { id: data.sucursalId } });
    if (!sucursal) throw new NotFoundException('Sucursal no encontrada');

    return this.prisma.articulo.create({ data });
  }

  // --- AÑADE ESTOS MÉTODOS DE CONSULTA ---
  async findAll() {
    return this.prisma.articulo.findMany({
      where: { estado: true },
    });
  }

  async findOne(id: number) {
    const articulo = await this.prisma.articulo.findUnique({ where: { id } });
    if (!articulo) throw new NotFoundException(`Artículo con ID ${id} no encontrado`);
    return articulo;
  }
}