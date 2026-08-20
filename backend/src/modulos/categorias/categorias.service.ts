import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { CreateCategoriaDto } from './dto/create-categoria.dto';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';

@Injectable()
export class CategoriasService {
  constructor(private readonly prisma: PrismaService) {}

  private esSuperadmin(usuarioActual: UsuarioAutenticado) {
    return (
      usuarioActual.rol === 'SUPERADMIN' && usuarioActual.restauranteId === null
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
      throw new NotFoundException('Sucursal no encontrada');
    }

    const sucursal = await this.prisma.sucursal.findFirst({
      where: {
        id: sucursalId,
        estado: true,
        ...(!this.esSuperadmin(usuarioActual)
          ? {
              restauranteId: usuarioActual.restauranteId,
            }
          : {}),
      },
    });

    if (!sucursal) {
      throw new NotFoundException('Sucursal no encontrada');
    }

    return sucursal;
  }

  async create(data: CreateCategoriaDto, usuarioActual: UsuarioAutenticado) {
    await this.validarSucursalDentroDelAlcance(data.sucursalId, usuarioActual);

    return this.prisma.categoria.create({
      data,
    });
  }

  async findAllPorSucursal(
    sucursalId: number,
    usuarioActual: UsuarioAutenticado,
  ) {
    await this.validarSucursalDentroDelAlcance(sucursalId, usuarioActual);

    return this.prisma.categoria.findMany({
      where: {
        sucursalId,
        estado: true,
      },
      orderBy: {
        id: 'asc',
      },
    });
  }
}
