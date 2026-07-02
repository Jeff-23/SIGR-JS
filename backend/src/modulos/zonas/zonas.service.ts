import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateZonaDto } from './dto/create-zona.dto';

@Injectable()
export class ZonasService {
  constructor(private prisma: PrismaService) {}

  async create(data: CreateZonaDto) {
    const sucursalExiste = await this.prisma.sucursal.findUnique({
      where: { id: data.sucursalId },
    });
    
    if (!sucursalExiste) {
      throw new NotFoundException(`La sucursal con ID ${data.sucursalId} no existe.`);
    }

    return this.prisma.zona.create({ data });
  }

  async findAllPorSucursal(sucursalId: number) {
    return this.prisma.zona.findMany({
      where: { sucursalId, estado: true }
    });
  }
}