import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateMetodoPagoDto } from './dto/create-metodo-pago.dto';

@Injectable()
export class MetodosPagoService {
  constructor(private prisma: PrismaService) {}

  create(data: CreateMetodoPagoDto) {
    return this.prisma.metodoPago.create({ data });
  }

  findAll() {
    return this.prisma.metodoPago.findMany({ where: { activo: true } });
  }
}
