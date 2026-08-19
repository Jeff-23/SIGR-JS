import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  TipoMovimientoInventario,
} from '@prisma/client';

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

    return this.prisma.$transaction(
      async (tx) => {
        const articulo =
          await tx.articulo.create({
            data,
          });

        if (
          articulo.stock.gt(0)
        ) {
          await tx.movimientoInventario.create({
            data: {
              tipo:
                TipoMovimientoInventario.ENTRADA,
              cantidad:
                articulo.stock,
              unidad:
                articulo.unidad,
              stockAnterior:
                new Prisma.Decimal(0),
              stockNuevo:
                articulo.stock,
              motivo:
                'Stock inicial del artículo',
              sucursalId:
                articulo.sucursalId,
              usuarioId:
                usuarioActual.id,
              articuloId:
                articulo.id,
            },
          });
        }

        return articulo;
      },
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel
            .Serializable,
      },
    );
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
    const articulo =
      await this.buscarDentroDelAlcance(
        id,
        usuarioActual,
      );

    if (
      data.unidad !== undefined &&
      data.unidad !== articulo.unidad &&
      articulo.stock.gt(0)
    ) {
      throw new BadRequestException(
        'No se puede cambiar la unidad de un artículo con stock existente. Ajuste primero el stock a cero.',
      );
    }

    return this.prisma.articulo.update({
      where: {
        id,
      },
      data,
    });
  }
}
