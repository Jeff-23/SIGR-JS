import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

import { CreateSucursalDto } from './dto/create-sucursal.dto';
import { UpdateSucursalDto } from './dto/update-sucursal.dto';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';

@Injectable()
export class SucursalesService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  private esSuperadmin(
    usuarioActual: UsuarioAutenticado,
  ) {
    return usuarioActual.restauranteId === null;
  }

  private async validarRestauranteActivo(
    restauranteId: number,
  ) {
    const restaurante =
      await this.prisma.restaurante.findFirst({
        where: {
          id: restauranteId,
          estado: true,
        },
      });

    if (!restaurante) {
      throw new NotFoundException(
        'Restaurante no encontrado',
      );
    }

    return restaurante;
  }

  private async buscarDentroDelAlcance(
    id: number,
    usuarioActual: UsuarioAutenticado,
  ) {
    if (
      usuarioActual.sucursalId !== null &&
      usuarioActual.sucursalId !== id
    ) {
      throw new NotFoundException(
        'Sucursal no encontrada',
      );
    }

    const where: {
      id: number;
      estado: boolean;
      restauranteId?: number;
    } = {
      id,
      estado: true,
    };

    if (!this.esSuperadmin(usuarioActual)) {
      where.restauranteId =
        usuarioActual.restauranteId!;
    }

    const sucursal =
      await this.prisma.sucursal.findFirst({
        where,
      });

    if (!sucursal) {
      throw new NotFoundException(
        'Sucursal no encontrada',
      );
    }

    return sucursal;
  }

  async create(
    data: CreateSucursalDto,
    usuarioActual: UsuarioAutenticado,
  ) {
    if (
      !this.esSuperadmin(usuarioActual) &&
      usuarioActual.sucursalId !== null
    ) {
      throw new ForbiddenException(
        'Un administrador limitado a sucursal no puede crear nuevas sucursales',
      );
    }

    if (
      !this.esSuperadmin(usuarioActual) &&
      data.restauranteId !==
        usuarioActual.restauranteId
    ) {
      throw new ForbiddenException(
        'No puedes crear sucursales para otro restaurante',
      );
    }

    await this.validarRestauranteActivo(
      data.restauranteId,
    );

    return this.prisma.sucursal.create({
      data,
    });
  }

  findAll(
    usuarioActual: UsuarioAutenticado,
  ) {
    if (this.esSuperadmin(usuarioActual)) {
      return this.prisma.sucursal.findMany({
        where: {
          estado: true,
        },
        orderBy: {
          id: 'asc',
        },
      });
    }

    if (usuarioActual.sucursalId !== null) {
      return this.prisma.sucursal.findMany({
        where: {
          id: usuarioActual.sucursalId,
          restauranteId:
            usuarioActual.restauranteId!,
          estado: true,
        },
      });
    }

    return this.prisma.sucursal.findMany({
      where: {
        restauranteId:
          usuarioActual.restauranteId!,
        estado: true,
      },
      orderBy: {
        id: 'asc',
      },
    });
  }

  async findOne(
    id: number,
    usuarioActual: UsuarioAutenticado,
  ) {
    return this.buscarDentroDelAlcance(
      id,
      usuarioActual,
    );
  }

  async update(
    id: number,
    data: UpdateSucursalDto,
    usuarioActual: UsuarioAutenticado,
  ) {
    await this.buscarDentroDelAlcance(
      id,
      usuarioActual,
    );

    return this.prisma.sucursal.update({
      where: {
        id,
      },
      data,
    });
  }

  async remove(
    id: number,
    usuarioActual: UsuarioAutenticado,
  ) {
    await this.buscarDentroDelAlcance(
      id,
      usuarioActual,
    );

    if (
      !this.esSuperadmin(usuarioActual) &&
      usuarioActual.sucursalId !== null
    ) {
      throw new ForbiddenException(
        'Un administrador limitado a sucursal no puede desactivar su sucursal',
      );
    }

    return this.prisma.sucursal.update({
      where: {
        id,
      },
      data: {
        estado: false,
      },
    });
  }
}