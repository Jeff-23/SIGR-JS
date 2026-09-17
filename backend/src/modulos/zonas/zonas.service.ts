import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { CreateZonaDto } from './dto/create-zona.dto';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';
import { SyncBusinessService } from '../sync/sync-business.service';

@Injectable()
export class ZonasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly syncBusiness: SyncBusinessService,
  ) {}

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

  async create(data: CreateZonaDto, usuarioActual: UsuarioAutenticado) {
    await this.validarSucursalDentroDelAlcance(data.sucursalId, usuarioActual);

    return this.prisma.$transaction(async (tx) => {
      const zona = await tx.zona.create({ data });
      await this.syncBusiness.encolarZona(tx, zona.id);
      return zona;
    });
  }

  async findAllPorSucursal(
    sucursalId: number,
    usuarioActual: UsuarioAutenticado,
  ) {
    await this.validarSucursalDentroDelAlcance(sucursalId, usuarioActual);

    return this.prisma.zona.findMany({
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
