import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

import { CreateRestauranteDto } from './dto/create-restaurante.dto';
import { UpdateRestauranteDto } from './dto/update-restaurante.dto';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';

@Injectable()
export class RestaurantesService {
  constructor(private readonly prisma: PrismaService) {}

  private esSuperadmin(usuarioActual: UsuarioAutenticado) {
    return (
      usuarioActual.rol === 'SUPERADMIN' && usuarioActual.restauranteId === null
    );
  }

  private async buscarDentroDelAlcance(
    id: number,
    usuarioActual: UsuarioAutenticado,
  ) {
    if (
      !this.esSuperadmin(usuarioActual) &&
      usuarioActual.restauranteId !== id
    ) {
      throw new NotFoundException('Restaurante no encontrado');
    }

    const restaurante = await this.prisma.restaurante.findFirst({
      where: {
        id,
        estado: true,
      },
    });

    if (!restaurante) {
      throw new NotFoundException('Restaurante no encontrado');
    }

    return restaurante;
  }

  async create(data: CreateRestauranteDto, usuarioActual: UsuarioAutenticado) {
    if (!this.esSuperadmin(usuarioActual)) {
      throw new ForbiddenException(
        'Solo un administrador de plataforma puede crear restaurantes',
      );
    }

    return this.prisma.restaurante.create({
      data,
    });
  }

  findAll(usuarioActual: UsuarioAutenticado) {
    if (this.esSuperadmin(usuarioActual)) {
      return this.prisma.restaurante.findMany({
        where: {
          estado: true,
        },

        orderBy: {
          id: 'asc',
        },
      });
    }

    return this.prisma.restaurante.findMany({
      where: {
        id: usuarioActual.restauranteId,
        estado: true,
      },
    });
  }

  async findOne(id: number, usuarioActual: UsuarioAutenticado) {
    await this.buscarDentroDelAlcance(id, usuarioActual);

    const filtroSucursales =
      usuarioActual.sucursalId !== null
        ? {
            id: usuarioActual.sucursalId,
            estado: true,
          }
        : {
            estado: true,
          };

    return this.prisma.restaurante.findUnique({
      where: {
        id,
      },

      include: {
        sucursales: {
          where: filtroSucursales,
          orderBy: {
            id: 'asc',
          },
        },
      },
    });
  }

  async update(
    id: number,
    data: UpdateRestauranteDto,
    usuarioActual: UsuarioAutenticado,
  ) {
    await this.buscarDentroDelAlcance(id, usuarioActual);

    if (
      !this.esSuperadmin(usuarioActual) &&
      usuarioActual.sucursalId !== null
    ) {
      throw new ForbiddenException(
        'Un administrador limitado a sucursal no puede modificar el restaurante',
      );
    }

    return this.prisma.restaurante.update({
      where: {
        id,
      },

      data,
    });
  }

  async remove(id: number, usuarioActual: UsuarioAutenticado) {
    if (!this.esSuperadmin(usuarioActual)) {
      throw new ForbiddenException(
        'Solo un administrador de plataforma puede desactivar restaurantes',
      );
    }

    await this.buscarDentroDelAlcance(id, usuarioActual);

    return this.prisma.restaurante.update({
      where: {
        id,
      },

      data: {
        estado: false,
      },
    });
  }
}
