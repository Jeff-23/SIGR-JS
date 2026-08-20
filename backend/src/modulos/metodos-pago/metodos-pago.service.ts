import { ForbiddenException, Injectable } from '@nestjs/common';

import { TipoMetodoPago } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { CreateMetodoPagoDto } from './dto/create-metodo-pago.dto';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';

@Injectable()
export class MetodosPagoService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateMetodoPagoDto, usuarioActual: UsuarioAutenticado) {
    /*
     * MetodoPago continúa siendo un catálogo
     * global de la plataforma SIGR.
     *
     * Desde Sprint 5 también se clasifica por
     * tipo para que Caja pueda separar efectivo
     * de pagos electrónicos sin depender del
     * texto visible del método de pago.
     */
    if (usuarioActual.restauranteId !== null) {
      throw new ForbiddenException(
        'Solo el superadministrador de SIGR puede crear métodos de pago globales',
      );
    }

    return this.prisma.metodoPago.create({
      data: {
        nombre: data.nombre.trim(),
        tipo: data.tipo ?? TipoMetodoPago.OTRO,
      },
    });
  }

  findAll() {
    return this.prisma.metodoPago.findMany({
      where: {
        activo: true,
      },

      orderBy: [
        {
          tipo: 'asc',
        },
        {
          nombre: 'asc',
        },
      ],
    });
  }
}
