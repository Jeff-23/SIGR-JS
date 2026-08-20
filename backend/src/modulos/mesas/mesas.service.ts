import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { CreateMesaDto } from './dto/create-mesa.dto';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';

@Injectable()
export class MesasService {
  constructor(private readonly prisma: PrismaService) {}

  private esSuperadmin(usuarioActual: UsuarioAutenticado) {
    return (
      usuarioActual.rol === 'SUPERADMIN' && usuarioActual.restauranteId === null
    );
  }

  private async validarZonaDentroDelAlcance(
    zonaId: number,
    usuarioActual: UsuarioAutenticado,
  ) {
    const zona = await this.prisma.zona.findFirst({
      where: {
        id: zonaId,
        estado: true,

        sucursal: {
          estado: true,

          ...(!this.esSuperadmin(usuarioActual)
            ? {
                restauranteId: usuarioActual.restauranteId,
              }
            : {}),

          ...(usuarioActual.sucursalId !== null
            ? {
                id: usuarioActual.sucursalId,
              }
            : {}),
        },
      },
      select: {
        id: true,
        sucursalId: true,
      },
    });

    if (!zona) {
      throw new NotFoundException('Zona no encontrada');
    }

    return zona;
  }

  async create(data: CreateMesaDto, usuarioActual: UsuarioAutenticado) {
    await this.validarZonaDentroDelAlcance(data.zonaId, usuarioActual);

    return this.prisma.mesa.create({
      data,
    });
  }

  async findAll(usuarioActual: UsuarioAutenticado) {
    return this.prisma.mesa.findMany({
      where: {
        estado: true,

        zona: {
          estado: true,

          sucursal: {
            estado: true,

            ...(!this.esSuperadmin(usuarioActual)
              ? {
                  restauranteId: usuarioActual.restauranteId,
                }
              : {}),

            ...(usuarioActual.sucursalId !== null
              ? {
                  id: usuarioActual.sucursalId,
                }
              : {}),
          },
        },
      },

      orderBy: {
        numero: 'asc',
      },
    });
  }
}
