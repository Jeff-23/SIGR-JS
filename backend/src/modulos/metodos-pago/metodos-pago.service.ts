import {
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { CreateMetodoPagoDto } from './dto/create-metodo-pago.dto';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';

@Injectable()
export class MetodosPagoService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async create(
    data: CreateMetodoPagoDto,
    usuarioActual: UsuarioAutenticado,
  ) {
    /*
     * MetodoPago es, por ahora, un catálogo
     * global de la plataforma SIGR.
     *
     * Por eso únicamente el SUPERADMIN SIGR
     * puede modificarlo.
     *
     * SUPERADMIN:
     * restauranteId === null
     */
    if (usuarioActual.restauranteId !== null) {
      throw new ForbiddenException(
        'Solo el superadministrador de SIGR puede crear métodos de pago globales',
      );
    }

    return this.prisma.metodoPago.create({
      data: {
        nombre: data.nombre.trim(),
      },
    });
  }

  findAll() {
    return this.prisma.metodoPago.findMany({
      where: {
        activo: true,
      },

      orderBy: {
        nombre: 'asc',
      },
    });
  }
}