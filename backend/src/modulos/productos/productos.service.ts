import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { CreateProductoDto } from './dto/create-producto.dto';
import { UpdateProductoDto } from './dto/update-producto.dto';
import { UsuarioAutenticado } from '../auth/types/usuario-autenticado.type';

@Injectable()
export class ProductosService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  private esSuperadmin(
    usuarioActual: UsuarioAutenticado,
  ) {
    return usuarioActual.restauranteId === null;
  }

  private async validarCategoriaDentroDelAlcance(
    categoriaId: number,
    usuarioActual: UsuarioAutenticado,
  ) {
    const categoria =
      await this.prisma.categoria.findFirst({
        where: {
          id: categoriaId,
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
        select: {
          id: true,
          sucursalId: true,
        },
      });

    if (!categoria) {
      throw new NotFoundException(
        'Categoría no encontrada',
      );
    }

    return categoria;
  }

  private async buscarProductoDentroDelAlcance(
    id: number,
    usuarioActual: UsuarioAutenticado,
  ) {
    const producto =
      await this.prisma.producto.findFirst({
        where: {
          id,
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
      });

    if (!producto) {
      throw new NotFoundException(
        'Producto no encontrado',
      );
    }

    return producto;
  }

  async create(
    data: CreateProductoDto,
    usuarioActual: UsuarioAutenticado,
  ) {
    await this.validarCategoriaDentroDelAlcance(
      data.categoriaId,
      usuarioActual,
    );

    return this.prisma.producto.create({
      data,
    });
  }

  async findAll(
    usuarioActual: UsuarioAutenticado,
  ) {
    return this.prisma.producto.findMany({
      where: {
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

      include: {
        recetas: true,
      },

      orderBy: {
        id: 'asc',
      },
    });
  }

  async update(
    id: number,
    data: UpdateProductoDto,
    usuarioActual: UsuarioAutenticado,
  ) {
    await this.buscarProductoDentroDelAlcance(
      id,
      usuarioActual,
    );

    return this.prisma.producto.update({
      where: {
        id,
      },
      data,
    });
  }
}