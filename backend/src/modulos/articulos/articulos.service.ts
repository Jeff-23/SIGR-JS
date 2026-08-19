import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { CreateArticuloDto } from './dto/create-articulo.dto';
import { UpdateArticuloDto } from './dto/update-articulo.dto';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';

@Injectable()
export class ArticulosService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  private esSuperadmin(
    usuarioActual:
      UsuarioAutenticado,
  ) {
    return (
      usuarioActual.rol ===
        'SUPERADMIN' &&
      usuarioActual.restauranteId ===
        null
    );
  }

  private async validarSucursalDentroDelAlcance(
    sucursalId: number,
    usuarioActual: UsuarioAutenticado,
  ) {
    if (
      usuarioActual.sucursalId !== null &&
      usuarioActual.sucursalId !== sucursalId
    ) {
      throw new NotFoundException(
        'Sucursal no encontrada',
      );
    }

    const sucursal =
      await this.prisma.sucursal.findFirst({
        where: {
          id: sucursalId,
          estado: true,

          ...(!this.esSuperadmin(usuarioActual)
            ? {
                restauranteId:
                  usuarioActual.restauranteId!,
              }
            : {}),
        },
      });

    if (!sucursal) {
      throw new NotFoundException(
        'Sucursal no encontrada',
      );
    }

    return sucursal;
  }

  private async buscarDentroDelAlcance(
    id: number,
    usuarioActual: UsuarioAutenticado,
  ) {
    const articulo =
      await this.prisma.articulo.findFirst({
        where: {
          id,
          estado: true,

          sucursal: {
            estado: true,

            ...(!this.esSuperadmin(usuarioActual)
              ? {
                  restauranteId:
                    usuarioActual.restauranteId!,
                }
              : {}),

            ...(usuarioActual.sucursalId !== null
              ? {
                  id: usuarioActual.sucursalId,
                }
              : {}),
          },
        },
      });

    if (!articulo) {
      throw new NotFoundException(
        'Artículo no encontrado',
      );
    }

    return articulo;
  }

  async create(
    data: CreateArticuloDto,
    usuarioActual: UsuarioAutenticado,
  ) {
    await this.validarSucursalDentroDelAlcance(
      data.sucursalId,
      usuarioActual,
    );

    return this.prisma.articulo.create({
      data,
    });
  }

  async findAll(
    usuarioActual: UsuarioAutenticado,
  ) {
    return this.prisma.articulo.findMany({
      where: {
        estado: true,

        sucursal: {
          estado: true,

          ...(!this.esSuperadmin(usuarioActual)
            ? {
                restauranteId:
                  usuarioActual.restauranteId!,
              }
            : {}),

          ...(usuarioActual.sucursalId !== null
            ? {
                id: usuarioActual.sucursalId,
              }
            : {}),
        },
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
    data: UpdateArticuloDto,
    usuarioActual: UsuarioAutenticado,
  ) {
    await this.buscarDentroDelAlcance(
      id,
      usuarioActual,
    );

    return this.prisma.articulo.update({
      where: {
        id,
      },
      data,
    });
  }
}
