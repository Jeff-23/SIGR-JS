import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { CreateRecetaDto } from './dto/create-receta.dto';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';

@Injectable()
export class RecetasService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  private esSuperadmin(
    usuarioActual: UsuarioAutenticado,
  ) {
    return usuarioActual.restauranteId === null;
  }

  async create(
    data: CreateRecetaDto,
    usuarioActual: UsuarioAutenticado,
  ) {
    const producto =
      await this.prisma.producto.findFirst({
        where: {
          id: data.productoId,
          estado: true,

          categoria: {
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
        },

        select: {
          id: true,

          categoria: {
            select: {
              sucursalId: true,
            },
          },
        },
      });

    if (!producto) {
      throw new NotFoundException(
        'Producto no encontrado',
      );
    }

    const sucursalProducto =
      producto.categoria.sucursalId;

    const articulo =
      await this.prisma.articulo.findFirst({
        where: {
          id: data.articuloId,
          estado: true,
          sucursalId: sucursalProducto,

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
        'Artículo no encontrado para la sucursal del producto',
      );
    }

    const existe =
      await this.prisma.receta.findUnique({
        where: {
          productoId_articuloId: {
            productoId: data.productoId,
            articuloId: data.articuloId,
          },
        },
      });

    if (existe) {
      throw new ConflictException(
        'Este ingrediente ya está asignado a la receta del producto',
      );
    }

    return this.prisma.receta.create({
      data,
    });
  }
}