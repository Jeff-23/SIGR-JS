import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateMesaDto } from './dto/create-mesa.dto';

@Injectable()
export class MesasService {
  constructor(private prisma: PrismaService) {}

  async create(data: CreateMesaDto) {
    const zonaExiste = await this.prisma.zona.findUnique({
      where: { id: data.zonaId },
    });
    
    if (!zonaExiste) {
      throw new NotFoundException(`La zona con ID ${data.zonaId} no existe.`);
    }

    return this.prisma.mesa.create({ data });
  }
}