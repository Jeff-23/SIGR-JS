import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCategoriaDto } from './dto/create-categoria.dto';

@Injectable()
export class CategoriasService {
  constructor(private prisma: PrismaService) {}

  async create(data: CreateCategoriaDto) {
    const sucursalExiste = await this.prisma.sucursal.findUnique({
      where: { id: data.sucursalId },
    });
    
    if (!sucursalExiste) {
      throw new NotFoundException(`La sucursal con ID ${data.sucursalId} no existe.`);
    }

    return this.prisma.categoria.create({ data });
  }

  async findAllPorSucursal(sucursalId: number) {
    return this.prisma.categoria.findMany({
      where: { sucursalId, estado: true }
    });
  }
}
