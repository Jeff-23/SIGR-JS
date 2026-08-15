import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateMesaDto } from './dto/create-mesa.dto';

@Injectable()
export class MesasService {
  constructor(private prisma: PrismaService) {}

  async create(data: CreateMesaDto) {
    return this.prisma.mesa.create({ data });
  }

  async findAll() {
    return this.prisma.mesa.findMany({
      where: { estado: true },
      orderBy: { numero: 'asc' } // Las ordena de menor a mayor automáticamente
    });
  }
}